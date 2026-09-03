/* Turns the raw HTML dropped in the shared folder by the iPad Shortcut into the
   same article shape the in-page extraction produces, so the rest of the
   pipeline (EPUB, filename, date folder, queue, upload) stays untouched. */

// In the extension the popup loads newsletter_names.js first; the Node tests
// load this file on its own, so pull it in here as well.
if (typeof globalThis.NewsletterNames === 'undefined' && typeof require !== 'undefined') {
    globalThis.NewsletterNames = require('./newsletter_names.js');
}

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

    // The document's own <title>, when it has one: still a better name than
    // "Documento 3" if no heading in the file carries the title.
    titleFromDocument(html) {
        const tag = /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(String(html || ''));
        return tag ? this.stripTags(tag[1]) : '';
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
        //
        // That heading can arrive *empty*. A newsletter read in the browser is an
        // HTML email — tables, an empty <title>, no og:title — and the article
        // extractor on iOS finds no title to hand over. The title is still written
        // in the page, in the newsletter's own <h1>, so keep looking: take the
        // first heading that actually holds text instead of stopping at the first
        // one and falling back to the filename.
        const headings = [...source.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi)];
        const heading = headings.find((candidate) => this.stripTags(candidate[1])) || headings[0];

        // A recognised newsletter is named after itself, not after the issue:
        // "Whatever It Takes" is what the file is looked for by on the device.
        // The issue's own title then has to *stay* in the body — it is the only
        // copy left, and without it the article would open with no headline.
        const newsletter = NewsletterNames.detect(options.filename, html);

        if (heading && !newsletter) source = source.replace(heading[0], '');
        // An empty heading is noise in the body as well, so it goes too.
        for (const candidate of headings) {
            if ((candidate !== heading || newsletter) && !this.stripTags(candidate[1])) {
                source = source.replace(candidate[0], '');
            }
        }

        const inBody = /<body\b[^>]*>([\s\S]*?)<\/body>/i.exec(source);
        const body = inBody ? inBody[1] : source.replace(/<\/?(?:!doctype|html|head|meta|title|link|style|script)\b[^>]*>/gi, '');

        // Where the title came from decides whether the queue asks for a better
        // one: 'filename' means nothing in the document named this article, and
        // the file is about to reach the device called "unknown-links.newsletter".
        const fromHeading = heading ? this.stripTags(heading[1]) : '';
        const fromDocument = this.titleFromDocument(html);
        const title = newsletter || fromHeading || fromDocument || this.titleFromFilename(options.filename);
        const titleSource = (newsletter && 'newsletter')
            || (fromHeading && 'heading')
            || (fromDocument && 'document-title')
            || 'filename';

        return {
            title,
            titleSource,
            // What a correction can be filed under, so the next issue of this
            // newsletter is named without asking again.
            campaign: NewsletterNames.findMarker(options.filename, html),
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
