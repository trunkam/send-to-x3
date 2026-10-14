/* The article's pictures, made ready for two e-readers.

   CrossPoint on the X3 shows JPG and PNG inside an EPUB, fitted to its screen;
   GIF, SVG and WebP it does not read. KOReader on the Kindle shows a picture at
   its own pixel size, so one made for the X3's 480 pixels fills less than half
   of the Kindle's page. Each picture is therefore made twice, in grays: 480
   pixels wide for the X3 and 1000 for the Kindle, and each EPUB takes its own.

   Charts drawn as SVG (Highcharts on the WSJ) reach this module already turned
   into pictures by the extraction in the page, the only place where their
   styles can be read; here they are one more source. Photos are downloaded
   from where the page had them.

   Pictures travel inside the article as base64, so a queued article keeps them
   when the page is long gone. In the body each one is an <img src="x3img:N">
   that EpubBuilder resolves to a file of the EPUB.

   The parsing, sizing and PNG encoding are plain functions tested under Node;
   prepare() needs a canvas and runs in the popup. */

// In the extension the popup loads html_article.js first; the Node tests load
// this file on its own, so pull it in here as well.
if (typeof globalThis.HtmlArticle === 'undefined' && typeof require !== 'undefined') {
    globalThis.HtmlArticle = require('./html_article.js');
}

const ArticleImages = {
    X3_WIDTH: 480,
    KINDLE_WIDTH: 1000,
    // A tall infographic is cut down to this many widths: past it the picture
    // costs the X3 memory and says nothing more on a six-inch page.
    MAX_ASPECT: 3,
    // Smaller than this is an icon, an avatar or a tracking pixel.
    MIN_WIDTH: 200,
    MIN_HEIGHT: 100,
    MAX_IMAGES: 30,
    JPEG_QUALITY: 0.8,
    FETCH_TIMEOUT_MS: 15000,

    // The fallback extraction reads the page as text; a picture travels in it
    // as a paragraph holding only this.
    marker(index) {
        return `[[x3-image:${index}]]`;
    },

    markerIndex(text) {
        const match = /^\[\[x3-image:(\d+)\]\]$/.exec(String(text || '').trim());
        return match ? Number(match[1]) : null;
    },

    /* Every <img> of the body, in order, with its source and alternative text.
       @returns {Array<{tag: string, index: number, src: string, alt: string}>} */
    findImages(body) {
        const found = [];
        const pattern = /<img\b(?:[^>"']|"[^"]*"|'[^']*')*>/gi;
        let match;
        while ((match = pattern.exec(String(body || '')))) {
            found.push({
                tag: match[0],
                index: match.index,
                src: this.attribute(match[0], 'src'),
                alt: this.attribute(match[0], 'alt')
            });
        }
        return found;
    },

    attribute(tag, name) {
        const match = new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i').exec(tag);
        if (!match) return '';
        return (match[1] ?? match[2] ?? match[3] ?? '')
            .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
            .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
    },

    /* The body with each found <img> replaced by what `replacements` holds for
       it, in the same order; an empty string drops the picture. */
    rewrite(body, found, replacements) {
        let result = '';
        let cursor = 0;
        found.forEach((image, i) => {
            result += body.slice(cursor, image.index) + replacements[i];
            cursor = image.index + image.tag.length;
        });
        return result + body.slice(cursor);
    },

    /* The body with every chart made in the page in it. A chart whose place the
       extraction lost - Readability keeps the article's body, and a chart
       opening the piece sits above it - goes back before the paragraph that
       followed it in the page, or else after the nearest one that preceded it,
       or else at the end: a chart is never lost for its place.
       @param {{body: string, charts?: Array<{alt: string, before?: string, after?: string[]}>,
                imageSources?: Array<{src: string}>}} article */
    placeMissingCharts(article) {
        const body = String(article?.body || '');
        const charts = article?.charts || [];
        if (!charts.length) return body;

        // Charts already in: named directly (Readability), or through a
        // fallback marker that stands for them.
        const used = new Set();
        for (const image of this.findImages(body)) {
            const chart = /^x3-chart:(\d+)$/.exec(image.src);
            const marked = /^x3-image:(\d+)$/.exec(image.src);
            const source = marked ? (article.imageSources || [])[Number(marked[1])] : null;
            const viaMarker = source && /^x3-chart:(\d+)$/.exec(source.src);
            if (chart) used.add(Number(chart[1]));
            if (viaMarker) used.add(Number(viaMarker[1]));
        }

        const text = globalThis.HtmlArticle;
        const paragraphs = [...body.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)].map(match => ({
            start: match.index,
            end: match.index + match[0].length,
            text: text.comparable(text.stripTags(match[1]))
        }));
        const find = (anchor) => {
            const wanted = text.comparable(anchor);
            return wanted ? paragraphs.find(p => p.text.startsWith(wanted)) : null;
        };

        const inserts = [];
        const unplaced = [];
        charts.forEach((chart, index) => {
            if (used.has(index)) return;
            const figure = `<figure><img src="x3-chart:${index}" alt="${this.escapeAttribute(chart.alt)}"/></figure>`;
            const next = chart.before ? find(chart.before) : null;
            if (next) {
                inserts.push({ at: next.start, figure });
                return;
            }
            for (const anchor of chart.after || []) {
                const previous = find(anchor);
                if (previous) {
                    inserts.push({ at: previous.end, figure });
                    return;
                }
            }
            unplaced.push(figure);
        });

        // From the back, so the positions still to use stay right; two charts
        // at one spot keep their order.
        let placed = body;
        inserts.map((insert, order) => ({ ...insert, order }))
            .sort((a, b) => b.at - a.at || b.order - a.order)
            .forEach(insert => {
                placed = placed.slice(0, insert.at) + insert.figure + placed.slice(insert.at);
            });
        return unplaced.length ? `${placed}\n${unplaced.join('\n')}` : placed;
    },

    escapeAttribute(text) {
        return String(text || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    },

    /* The size a picture takes for one reader: never wider than the reader, never
       enlarged, and never taller than MAX_ASPECT widths. */
    targetSize(width, height, maxWidth) {
        const scale = Math.min(1, maxWidth / width, (maxWidth * this.MAX_ASPECT) / height);
        return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
    },

    // One gray byte per pixel from RGBA, laid on white where it is transparent.
    toGray(rgba) {
        const gray = new Uint8Array(rgba.length / 4);
        for (let i = 0, p = 0; i < rgba.length; i += 4, p++) {
            const alpha = rgba[i + 3] / 255;
            const luma = 0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2];
            gray[p] = Math.round(luma * alpha + 255 * (1 - alpha));
        }
        return gray;
    },

    /* A PNG of one 8-bit gray channel. The canvas can only write RGBA, four times
       the pixels for the X3 to decode; a gray PNG is also what was tried on it.
       `deflate` compresses to the zlib format and is passed in, so this runs
       the same under Node and in the popup. */
    async encodeGrayPng(gray, width, height, deflate = ArticleImages.zlib) {
        const raw = new Uint8Array((width + 1) * height);
        for (let y = 0; y < height; y++) {
            raw[y * (width + 1)] = 0; // filter: none
            raw.set(gray.subarray(y * width, (y + 1) * width), y * (width + 1) + 1);
        }
        const header = new Uint8Array(13);
        const view = new DataView(header.buffer);
        view.setUint32(0, width);
        view.setUint32(4, height);
        header[8] = 8;  // bit depth
        header[9] = 0;  // color type: grayscale
        const chunks = [
            this.chunk('IHDR', header),
            this.chunk('IDAT', await deflate(raw)),
            this.chunk('IEND', new Uint8Array(0))
        ];
        const signature = [137, 80, 78, 71, 13, 10, 26, 10];
        const total = signature.length + chunks.reduce((sum, part) => sum + part.length, 0);
        const png = new Uint8Array(total);
        png.set(signature, 0);
        let offset = signature.length;
        for (const part of chunks) {
            png.set(part, offset);
            offset += part.length;
        }
        return png;
    },

    chunk(type, data) {
        const out = new Uint8Array(12 + data.length);
        const view = new DataView(out.buffer);
        view.setUint32(0, data.length);
        for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
        out.set(data, 8);
        view.setUint32(8 + data.length, this.crc32(out.subarray(4, 8 + data.length)));
        return out;
    },

    crc32(bytes) {
        if (!this.crcTable) {
            this.crcTable = new Uint32Array(256);
            for (let n = 0; n < 256; n++) {
                let c = n;
                for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
                this.crcTable[n] = c >>> 0;
            }
        }
        let crc = 0xFFFFFFFF;
        for (let i = 0; i < bytes.length; i++) crc = this.crcTable[(crc ^ bytes[i]) & 0xFF] ^ (crc >>> 8);
        return (crc ^ 0xFFFFFFFF) >>> 0;
    },

    async zlib(bytes) {
        const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate'));
        return new Uint8Array(await new Response(stream).arrayBuffer());
    },

    /* Charts and drawings keep their sharp edges as PNG; photographs are far
       smaller as JPEG. A chart made in the page is a PNG, and so is anything
       the site itself published as PNG or GIF. */
    wantsPng(blobType, fromChart) {
        return fromChart || /png|gif/i.test(blobType || '');
    },

    // --- In the popup --------------------------------------------------------

    /* Turns every picture of the article into its two versions and the body's
       <img> into references to them. What cannot be had - too small, not
       downloadable, not decodable - is taken out of the body, so neither EPUB
       points at the internet. Running it twice changes nothing.
       @returns {Promise<{article: object, added: number, failed: number}>} */
    async prepare(article, { fetchImpl = globalThis.fetch.bind(globalThis) } = {}) {
        if (!article || !article.body) return { article, added: 0, failed: 0 };
        const images = [...(article.images || [])];
        const found = this.findImages(article.body);
        const replacements = [];
        let added = 0;
        let failed = 0;

        for (const image of found) {
            if (image.src.startsWith('x3img:')) {
                replacements.push(image.tag);
                continue;
            }
            if (added >= this.MAX_IMAGES) {
                replacements.push('');
                continue;
            }
            try {
                const source = this.resolveSource(article, image);
                if (!source) {
                    replacements.push('');
                    continue;
                }
                const blob = await this.load(source.src, fetchImpl);
                const bitmap = await createImageBitmap(blob);
                if (bitmap.width < this.MIN_WIDTH || bitmap.height < this.MIN_HEIGHT) {
                    replacements.push('');
                    continue;
                }
                const png = this.wantsPng(blob.type, source.chart);
                const entry = {
                    alt: source.alt,
                    x3: await this.render(bitmap, this.X3_WIDTH, png),
                    kindle: await this.render(bitmap, this.KINDLE_WIDTH, png)
                };
                if (bitmap.close) bitmap.close();
                images.push(entry);
                replacements.push(`<img src="x3img:${images.length - 1}" alt="${this.escapeAttribute(source.alt)}"/>`);
                added++;
            } catch (error) {
                console.warn('[ArticleImages] Picture left out:', image.src.slice(0, 120), error.message);
                replacements.push('');
                failed++;
            }
        }

        const prepared = { ...article, body: this.rewrite(article.body, found, replacements), images };
        delete prepared.charts;
        delete prepared.imageSources;
        return { article: prepared, added, failed };
    },

    /* Where a picture's bytes are: a chart made in the page, a picture the
       fallback marked, or an address. */
    resolveSource(article, image) {
        const chart = /^x3-chart:(\d+)$/.exec(image.src);
        if (chart) {
            const made = (article.charts || [])[Number(chart[1])];
            // A drawing made into a PNG in the page, or the address of a
            // picture the page showed as a background.
            return made ? { src: made.dataUrl || made.src, alt: image.alt || made.alt || '', chart: true } : null;
        }
        const marked = /^x3-image:(\d+)$/.exec(image.src);
        if (marked) {
            const source = (article.imageSources || [])[Number(marked[1])];
            if (!source) return null;
            return this.resolveSource(article, { ...image, src: source.src, alt: image.alt || source.alt || '' });
        }
        if (/^(https?:|data:image\/)/i.test(image.src)) return { src: image.src, alt: image.alt, chart: false };
        return null;
    },

    async load(src, fetchImpl) {
        const signal = typeof AbortSignal !== 'undefined' && AbortSignal.timeout ? AbortSignal.timeout(this.FETCH_TIMEOUT_MS) : undefined;
        const response = await fetchImpl(src, { signal });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.blob();
    },

    async render(bitmap, maxWidth, png) {
        const size = this.targetSize(bitmap.width, bitmap.height, maxWidth);
        const canvas = typeof OffscreenCanvas !== 'undefined'
            ? new OffscreenCanvas(size.width, size.height)
            : Object.assign(document.createElement('canvas'), size);
        const context = canvas.getContext('2d');
        context.fillStyle = '#fff';
        context.fillRect(0, 0, size.width, size.height);
        context.imageSmoothingQuality = 'high';
        context.drawImage(bitmap, 0, 0, size.width, size.height);
        const pixels = context.getImageData(0, 0, size.width, size.height);
        const gray = this.toGray(pixels.data);

        if (png) {
            const bytes = await this.encodeGrayPng(gray, size.width, size.height);
            return { type: 'image/png', base64: KindleOutbox.toBase64(bytes), ...size };
        }
        for (let i = 0, p = 0; i < pixels.data.length; i += 4, p++) {
            pixels.data[i] = pixels.data[i + 1] = pixels.data[i + 2] = gray[p];
            pixels.data[i + 3] = 255;
        }
        context.putImageData(pixels, 0, 0);
        const blob = canvas.convertToBlob
            ? await canvas.convertToBlob({ type: 'image/jpeg', quality: this.JPEG_QUALITY })
            : await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', this.JPEG_QUALITY));
        return { type: 'image/jpeg', base64: KindleOutbox.toBase64(await blob.arrayBuffer()), ...size };
    }
};

// Expose for classic scripts, ES modules (globalThis), and Node tests (CommonJS)
globalThis.ArticleImages = ArticleImages;
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ArticleImages;
}
