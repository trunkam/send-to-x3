/* Turns the raw HTML dropped in the shared folder by the iPad Shortcut into the
   same article shape the in-page extraction produces, so the rest of the
   pipeline (EPUB, filename, date folder, queue, upload) stays untouched. */
const HtmlArticle = {
    EXTENSIONS: ['.html', '.htm'],

    isHtmlFilename(filename) {
        const value = String(filename || '').toLowerCase();
        return this.EXTENSIONS.some(extension => value.endsWith(extension));
    },

    // The only cleanup rule that is right on every site: a 528x792 monochrome
    // e-ink screen has no use for vector charts, and they dominate the payload.
    stripSvg(html) {
        return String(html || '').replace(/<svg[\s\S]*?<\/svg>/gi, '');
    },

    stripTags(html) {
        return String(html || '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/\s+/g, ' ').trim();
    },

    // The Shortcut has no place to put the address, so it may be absent.
    findSourceUrl(html) {
        const canonical = /<link\b[^>]*\brel\s*=\s*["']?canonical["']?[^>]*>/i.exec(String(html || ''));
        const href = canonical && /\bhref\s*=\s*["']([^"']+)["']/i.exec(canonical[0]);
        return href ? href[1].trim() : '';
    },

    // "Documento 3.html" -> "Documento 3"
    titleFromFilename(filename) {
        const value = String(filename || '').replace(/\.[^.]+$/, '').trim();
        return value || 'Untitled';
    },

    /**
     * @param {string} html - the file as saved by the Shortcut
     * @param {Object} options - { filename, date }
     * @returns {Object} { title, author, date, body, sourceUrl }
     */
    parse(html, options = {}) {
        let source = this.stripSvg(html);

        // The Shortcut writes the title as an <h1> and lands it *before* the
        // doctype, so it has to be looked for in the whole document, not in the
        // body. It also has to come out: the EPUB template writes an <h1> of its
        // own, and leaving this one in would print the title twice.
        const heading = /<h1\b[^>]*>([\s\S]*?)<\/h1>/i.exec(source);
        if (heading) source = source.replace(heading[0], '');

        const inBody = /<body\b[^>]*>([\s\S]*?)<\/body>/i.exec(source);
        const body = inBody ? inBody[1] : source.replace(/<\/?(?:!doctype|html|head|meta|title|link|style|script)\b[^>]*>/gi, '');

        const title = (heading && this.stripTags(heading[1])) || this.titleFromFilename(options.filename);
        return {
            title,
            author: '',
            date: options.date || new Date().toISOString().split('T')[0],
            body: body.trim(),
            sourceUrl: this.findSourceUrl(source)
        };
    }
};

// Expose for classic scripts, ES modules (globalThis), and Node tests (CommonJS)
globalThis.HtmlArticle = HtmlArticle;
if (typeof module !== 'undefined' && module.exports) {
    module.exports = HtmlArticle;
}
