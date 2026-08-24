/**
 * EPUB Builder
 * Generates EPUB files from article/longpost data using JSZip
 */

// EpubBuilder will use the JSZip global from jszip.min.js (loaded via manifest)
// Keep all possible metadata before applying the filesystem byte limit below.
const MAX_EPUB_SANITIZED_BASENAME_CHARS = 500;
const MAX_EPUB_BASENAME_BYTES = 240;

/**
 * Month and day of the local calendar day, zero padded. The padding is what
 * makes the device's alphabetical file order match date order: unpadded,
 * 12-31 would sort before 2-1. Local components rather than toISOString(), so
 * an article sent late in the evening does not carry tomorrow's date.
 */
function sendDatePrefix(date) {
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${month}-${day}`;
}

/**
 * Limit a string by UTF-8 byte length without splitting a Unicode code point.
 * Grapheme clusters can still be truncated. This leaves room for the .epub
 * extension within common 255-byte filesystem filename limits.
 */
function truncateUtf8(text, maxBytes) {
    const encoder = new TextEncoder();
    let result = '';
    let byteLength = 0;

    for (const character of text) {
        const characterBytes = encoder.encode(character).length;
        if (byteLength + characterBytes > maxBytes) break;

        result += character;
        byteLength += characterBytes;
    }

    return result.trimEnd() || 'untitled';
}

const EpubBuilder = {
    /**
     * Generate EPUB blob from article data
     * @param {Object} article - { title, author, date, body, url }
     * @returns {Promise<Blob>} - EPUB blob
     */
    async build(article) {
        // JSZip is available globally from jszip.min.js loaded by service worker
        if (typeof JSZip === 'undefined') {
            throw new Error('JSZip not loaded');
        }

        const zip = new JSZip();
        const uuid = this.generateUuid();

        let coverMediaType = null;
        /*
        // Cover disabled for X4 compatibility
        if (article.coverUrl) {
            try {
                console.log('[EpubBuilder] Fetching cover:', article.coverUrl);
                const response = await fetch(article.coverUrl);
                if (response.ok) {
                    const blob = await response.blob();
                    coverMediaType = blob.type || 'image/jpeg'; // Default to jpeg if unknown
                    // Add to zip
                    zip.file('OEBPS/images/cover.jpg', blob);
                }
            } catch (e) {
                console.warn('[EpubBuilder] Failed to fetch cover:', e);
            }
        }
        */

        const metadata = {
            title: article.title,
            author: article.author,
            date: article.date,
            uuid: uuid,
            coverMediaType
        };

        // Add mimetype file (must be first and uncompressed)
        zip.file('mimetype', EpubTemplates.mimetype, { compression: 'STORE' });

        // Add container.xml in META-INF
        zip.file('META-INF/container.xml', EpubTemplates.containerXml);

        // Add content.opf
        zip.file('OEBPS/content.opf', EpubTemplates.contentOpf(metadata));

        // Add toc.ncx
        zip.file('OEBPS/toc.ncx', EpubTemplates.tocNcx(metadata));

        // Add content.xhtml (pass full article including url)
        zip.file('OEBPS/content.xhtml', EpubTemplates.contentXhtml(article));

        // Generate the EPUB as a Blob
        const epubBlob = await zip.generateAsync({
            type: 'blob',
            mimeType: 'application/epub+zip',
            compression: 'DEFLATE',
            compressionOptions: { level: 9 }
        });

        return epubBlob;
    },

    /**
     * Generate a filename for the EPUB
     * Format: MM-DD Title - Author - source - YYYY-MM-DD.epub
     *
     * The MM-DD prefix is the day the file is generated, not the day the
     * article was published: the device list truncates long names, so what
     * makes a file findable at a glance has to sit at the front, and the day
     * you sent it is how you look for it. It carries no year on purpose - a
     * send date is always recent, so the year adds nothing. That reasoning
     * does not hold for the publication date, which stays in full at the end
     * of the name: file_manager.parseDateFromFilename reads it to sort the
     * list, and a two-digit prefix does not fool its YYYY-MM-DD pattern.
     *
     * @param {Object} article - { title, author, date }
     * @param {Date} [now] - the send date; injectable so tests are stable
     * @returns {string}
     */
    generateFilename(article, now = new Date()) {
        const parts = [];

        // 1. Title (First)
        const safeTitle = Sanitizer.sanitizeFilename(article.title, 50);
        if (safeTitle) {
            parts.push(safeTitle);
        } else {
            parts.push('Untitled');
        }

        // 2. Author
        if (article.author) {
            const safeAuthor = Sanitizer.sanitizeFilename(article.author, 30);
            if (safeAuthor) parts.push(safeAuthor);
        }

        // 3. Source (Domain)
        if (article.sourceUrl) {
            try {
                const hostname = new URL(article.sourceUrl).hostname;
                const source = hostname.replace(/^www\./, '');
                parts.push(source);
            } catch (e) {
                // ignore invalid url
            }
        }

        // 4. Date (Last)
        const date = article.date || new Date().toISOString().split('T')[0];
        parts.push(date);

        // Sanitize the complete basename as a final safeguard. Metadata such as
        // dates and source domains are external input too. Limit its encoded
        // size, not its character count, because filenames are byte-limited.
        const safeBasename = Sanitizer.sanitizeFilename(
            `${sendDatePrefix(now)} ${parts.join(' - ')}`,
            MAX_EPUB_SANITIZED_BASENAME_CHARS
        );
        const basename = truncateUtf8(safeBasename, MAX_EPUB_BASENAME_BYTES);
        return `${basename}.epub`;
    },

    /**
     * Generate a UUID v4
     * @returns {string}
     */
    generateUuid() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
            const r = Math.random() * 16 | 0;
            const v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    },

    /**
     * Convert Blob to ArrayBuffer for message passing
     * @param {Blob} blob 
     * @returns {Promise<ArrayBuffer>}
     */
    async blobToArrayBuffer(blob) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = () => reject(reader.error);
            reader.readAsArrayBuffer(blob);
        });
    }
};

// Expose for classic scripts, ES modules (globalThis), and Node tests (CommonJS)
globalThis.EpubBuilder = EpubBuilder;
if (typeof module !== 'undefined' && module.exports) {
    module.exports = EpubBuilder;
}
