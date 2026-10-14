/* Turns the raw HTML dropped in the shared folder by the iPad Shortcut into the
   same article shape the in-page extraction produces, so the rest of the
   pipeline (EPUB, filename, date folder, queue, upload) stays untouched. */

// In the extension the popup loads newsletter_names.js first; the Node tests
// load this file on its own, so pull it in here as well.
if (typeof globalThis.NewsletterNames === 'undefined' && typeof require !== 'undefined') {
    globalThis.NewsletterNames = require('./newsletter_names.js');
}
if (typeof globalThis.ArticleCleanup === 'undefined' && typeof require !== 'undefined') {
    globalThis.ArticleCleanup = require('./article_cleanup.js');
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

    // A chart the Shortcut turned into a picture in the page
    // (scripts/ipad_shortcut_charts.js). Its Text step writes these after the
    // reader's HTML, outside <body>, so they are looked for in the whole file.
    CHART_PATTERN: /<figure\b[^>]*\bdata-x3-chart\b[^>]*>[\s\S]*?<\/figure>/gi,

    /* Takes the Shortcut's charts out of the file.
       @returns {{source: string, charts: Array<{picture: string, anchors: string[]}>}} */
    takeCharts(source) {
        const charts = [];
        const rest = String(source || '').replace(this.CHART_PATTERN, (figure) => {
            const picture = /<img\b[^>]*>/i.exec(figure);
            if (!picture) return '';
            const after = /\bdata-x3-after\s*=\s*"([^"]*)"/i.exec(figure);
            let anchors = [];
            try {
                anchors = after ? JSON.parse(decodeURIComponent(after[1])) : [];
            } catch {
                anchors = [];
            }
            charts.push({
                picture: picture[0],
                anchors: (Array.isArray(anchors) ? anchors : []).map(a => this.comparable(a)).filter(Boolean)
            });
            return '';
        });
        return { source: rest, charts };
    },

    /* Text as both sides can agree on it: the page gives the Shortcut plain
       text, the reader's HTML may spell the same with entities or other
       quotes. */
    comparable(text) {
        return String(text || '')
            .replace(/&nbsp;/gi, ' ')
            .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
            .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
            .replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'")
            .replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&amp;/gi, '&')
            .replace(/[‘’‚‛′]/g, "'").replace(/[“”„‟″]/g, '"')
            .replace(/[–—]/g, '-')
            .replace(/\s+/g, ' ')
            .trim()
            .toLowerCase();
    },

    /* Puts each chart after the paragraph that stood above it in the page, the
       nearest one the reader kept; one whose place cannot be found goes at the
       end, so a chart is never lost for its place. */
    placeCharts(body, charts) {
        if (!charts.length) return body;
        const paragraphs = [...body.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)].map(match => ({
            end: match.index + match[0].length,
            text: this.comparable(this.stripTags(match[1]))
        }));
        const inserts = [];
        const unplaced = [];
        for (const chart of charts) {
            const figure = `<figure>${chart.picture}</figure>`;
            let spot = null;
            for (const anchor of chart.anchors) {
                spot = paragraphs.find(p => p.text.startsWith(anchor)) || null;
                if (spot) break;
            }
            if (spot) inserts.push({ at: spot.end, figure });
            else unplaced.push(figure);
        }
        // From the back, so the positions still to use stay right; two charts
        // after one paragraph keep their order.
        let placed = body;
        const ordered = inserts.map((insert, order) => ({ ...insert, order }))
            .sort((a, b) => b.at - a.at || b.order - a.order);
        for (const insert of ordered) {
            placed = placed.slice(0, insert.at) + insert.figure + placed.slice(insert.at);
        }
        return unplaced.length ? `${placed}\n${unplaced.join('\n')}` : placed;
    },

    /**
     * @param {string} html - the file as saved by the Shortcut
     * @param {Object} options - { filename, date }
     * @returns {Object} { title, author, date, body, sourceUrl }
     */
    parse(html, options = {}) {
        const taken = this.takeCharts(this.stripSvg(html));
        let source = taken.source;

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
            // Safari's reader drops most of a page's furniture, not a
            // newsletter's sponsor section or its closing: the same cleanup as
            // the extension's Readability road, before the charts go back in.
            body: this.placeCharts(ArticleCleanup.stripMarkup(body.trim()).body, taken.charts),
            sourceUrl: this.findSourceUrl(source)
        };
    }
};

// Expose for classic scripts, ES modules (globalThis), and Node tests (CommonJS)
globalThis.HtmlArticle = HtmlArticle;
if (typeof module !== 'undefined' && module.exports) {
    module.exports = HtmlArticle;
}
