/* The cover of the Kindle's copy.

   KOReader's library shows books as covers. Without one, every article is a
   blank tile; with a picture taken from the article, they look like a pile of
   random photographs. So the cover is drawn: the masthead on a black band, the
   same for every article of that publication so it is recognised at a glance,
   and under it the article's title, which is what tells two of them apart.

   Only the Kindle gets it: the cover code inherited from Send to X4 was
   switched off "for X4 compatibility", and the X3's copy stays as it was.

   The masthead is written, not a logo: the logos are trademarks, and this
   repository is public. */
const KindleCover = {
    // The Paperwhite 4's screen, portrait.
    WIDTH: 1072,
    HEIGHT: 1448,
    JPEG_QUALITY: 0.9,
    FONT: 'Georgia, "Noto Serif", "DejaVu Serif", serif',

    // The same name on every article of a site, whatever its pages declare:
    // the WSJ's og:site_name is not the same on every page.
    KNOWN: [
        ['wsj.com', 'WSJ'],
        ['barrons.com', "Barron's"],
        ['ft.com', 'Financial Times'],
        ['nytimes.com', 'The New York Times'],
        ['economist.com', 'The Economist'],
        ['bloomberg.com', 'Bloomberg'],
        ['ilpost.it', 'Il Post'],
        ['corriere.it', 'Corriere della Sera'],
        ['ilsole24ore.com', 'Il Sole 24 Ore']
    ],

    /**
     * The name on the band: a known site's own, else what the page declared,
     * else the newsletter's Substack address, else the bare hostname.
     */
    publication(article) {
        const host = this.hostname(article);
        const known = this.KNOWN.find(([domain]) => host === domain || host.endsWith(`.${domain}`));
        if (known) return known[1];

        const declared = String(article.publication || '').trim();
        // "Substack" names the platform, not the newsletter.
        if (declared && !/^substack$/i.test(declared)) return declared;

        const substack = /^([a-z0-9-]+)\.substack\.com$/.exec(host);
        if (substack && substack[1] !== 'www') return this.capitalise(substack[1]);
        if (declared) return declared;

        return host.replace(/\.[a-z]+$/, '') || 'Articolo';
    },

    hostname(article) {
        try {
            return new URL(article.sourceUrl || article.url).hostname.replace(/^www\./, '').toLowerCase();
        } catch (e) {
            return '';
        }
    },

    capitalise(word) {
        return word.charAt(0).toUpperCase() + word.slice(1);
    },

    /**
     * Lines of at most maxWidth, broken between words. A word wider than the
     * line stays whole on a line of its own: cutting it reads worse.
     * @param {(text: string) => number} measure
     */
    wrap(text, maxWidth, measure) {
        const lines = [];
        let line = '';
        for (const word of String(text || '').split(/\s+/).filter(Boolean)) {
            const tried = line ? `${line} ${word}` : word;
            if (line && measure(tried) > maxWidth) {
                lines.push(line);
                line = word;
            } else {
                line = tried;
            }
        }
        if (line) lines.push(line);
        return lines;
    },

    /**
     * The largest size, from start down to min, at which the text fits in
     * maxLines lines; at the smallest size, the lines past maxLines are cut and
     * the last one ends in an ellipsis. maxLines can depend on the size, for
     * text that has a height to fill rather than a number of lines.
     * @param {number|((size: number) => number)} maxLines
     * @param {(text: string, size: number) => number} measure
     */
    fit(text, { maxWidth, maxLines, start, min, step = 4 }, measure) {
        const linesAt = size => Math.max(1, typeof maxLines === 'function' ? maxLines(size) : maxLines);
        for (let size = start; size >= min; size -= step) {
            const lines = this.wrap(text, maxWidth, t => measure(t, size));
            if (lines.length <= linesAt(size)) return { size, lines };
        }
        const lines = this.wrap(text, maxWidth, t => measure(t, min));
        const most = linesAt(min);
        if (lines.length <= most) return { size: min, lines };
        const kept = lines.slice(0, most);
        let last = `${kept[most - 1]}…`;
        while (last.length > 1 && measure(last, min) > maxWidth) last = `${last.slice(0, -2).trimEnd()}…`;
        kept[most - 1] = last;
        return { size: min, lines: kept };
    },

    /**
     * Draws the cover. Null where there is nothing to draw with (the tests'
     * Node), and the copy then simply has no cover.
     * @returns {Promise<Blob|null>}
     */
    async draw(article) {
        const canvas = typeof OffscreenCanvas !== 'undefined'
            ? new OffscreenCanvas(this.WIDTH, this.HEIGHT)
            : (typeof document !== 'undefined' ? Object.assign(document.createElement('canvas'), { width: this.WIDTH, height: this.HEIGHT }) : null);
        const context = canvas && canvas.getContext('2d');
        if (!context) return null;

        const W = this.WIDTH;
        const H = this.HEIGHT;
        const margin = 80;
        const textWidth = W - 2 * margin;
        const measure = weight => (text, size) => {
            context.font = `${weight} ${size}px ${this.FONT}`;
            return context.measureText(text).width;
        };

        context.fillStyle = '#fff';
        context.fillRect(0, 0, W, H);

        // The band: the same picture for every article of the publication.
        const bandHeight = 420;
        context.fillStyle = '#000';
        context.fillRect(0, 0, W, bandHeight);
        const masthead = this.fit(this.publication(article), { maxWidth: textWidth, maxLines: 2, start: 120, min: 56 }, measure('bold'));
        context.fillStyle = '#fff';
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.font = `bold ${masthead.size}px ${this.FONT}`;
        const mastLine = masthead.size * 1.15;
        masthead.lines.forEach((line, i) => {
            const y = bandHeight / 2 + (i - (masthead.lines.length - 1) / 2) * mastLine;
            context.fillText(line, W / 2, y);
        });

        // The title, as large as its length allows.
        const footerTop = H - 150;
        const titleTop = bandHeight + 90;
        const titleRoom = footerTop - 70 - titleTop;
        const LEADING = 1.22;
        const title = this.fit(article.title || 'Untitled', {
            maxWidth: textWidth,
            maxLines: size => Math.floor(titleRoom / (size * LEADING)),
            start: 104,
            min: 52
        }, measure('normal'));
        const titleLine = title.size * LEADING;
        context.fillStyle = '#000';
        context.textAlign = 'left';
        context.textBaseline = 'top';
        context.font = `normal ${title.size}px ${this.FONT}`;
        const titleBlock = title.lines.length * titleLine;
        // A little above the middle of its room, which reads as centred.
        const y0 = titleTop + Math.max(0, (titleRoom - titleBlock) / 2 - 40);
        title.lines.forEach((line, i) => context.fillText(line, margin, y0 + i * titleLine));

        // Footer: who and when, small and grey.
        const footer = [article.author, article.date].filter(Boolean).join(' · ');
        if (footer) {
            context.fillStyle = '#444';
            context.fillRect(margin, footerTop, textWidth, 3);
            const small = this.fit(footer, { maxWidth: textWidth, maxLines: 1, start: 40, min: 28 }, measure('normal'));
            context.font = `normal ${small.size}px ${this.FONT}`;
            context.fillText(small.lines[0], margin, footerTop + 30);
        }

        return canvas.convertToBlob
            ? canvas.convertToBlob({ type: 'image/jpeg', quality: this.JPEG_QUALITY })
            : new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', this.JPEG_QUALITY));
    }
};

// Expose for classic scripts, ES modules (globalThis), and Node tests (CommonJS)
globalThis.KindleCover = KindleCover;
if (typeof module !== 'undefined' && module.exports) {
    module.exports = KindleCover;
}
