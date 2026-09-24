/* A PDF of the article, for the archive and for sharing it with someone who
   has no e-reader.

   Written by hand rather than with a library. jsPDF's built-in fonts write
   curly quotes and dashes as two-byte garbage, and embedding a font that
   has them costs hundreds of KB. The fourteen standard PDF fonts are present
   in every PDF reader, and their WinAnsi encoding already covers Italian and
   the rest of Western Europe, typographic quotes included. What falls outside it
   (Greek, Cyrillic, emoji) loses its accent, turns into "?", or is dropped.

   Pictures come from the article, as ArticleImages made them: the Kindle's
   larger version, embedded as it is - a JPEG stays a JPEG, a PNG's compressed
   pixels go in without being decoded. Text is ASCII in the file; picture
   streams are the only binary. No DOM and no network: it runs in the
   background script and under Node's tests alike. */
const PdfBuilder = (() => {
    // Advance widths in thousandths of the font size, WinAnsi codes 32-255,
    // from Adobe's AFM files for the standard fonts.
    const WIDTHS = {
        regular: [
            250, 333, 408, 500, 500, 833, 778, 180, 333, 333, 500, 564, 250, 333, 250, 278,
            500, 500, 500, 500, 500, 500, 500, 500, 500, 500, 278, 278, 564, 564, 564, 444,
            921, 722, 667, 667, 722, 611, 556, 722, 722, 333, 389, 722, 611, 889, 722, 722,
            556, 722, 667, 556, 611, 722, 722, 944, 722, 722, 611, 333, 278, 333, 469, 500,
            333, 444, 500, 444, 500, 444, 333, 500, 500, 278, 278, 500, 278, 778, 500, 500,
            500, 500, 333, 389, 278, 500, 500, 722, 500, 500, 444, 480, 200, 480, 541, 0,
            500, 0, 333, 500, 444, 1000, 500, 500, 333, 1000, 556, 333, 889, 0, 611, 0,
            0, 333, 333, 444, 444, 350, 500, 1000, 333, 980, 389, 333, 722, 0, 444, 722,
            250, 333, 500, 500, 500, 500, 200, 500, 333, 760, 276, 500, 564, 333, 760, 333,
            400, 564, 300, 300, 333, 500, 453, 250, 333, 300, 310, 500, 750, 750, 750, 444,
            722, 722, 722, 722, 722, 722, 889, 667, 611, 611, 611, 611, 333, 333, 333, 333,
            722, 722, 722, 722, 722, 722, 722, 564, 722, 722, 722, 722, 722, 722, 556, 500,
            444, 444, 444, 444, 444, 444, 667, 444, 444, 444, 444, 444, 278, 278, 278, 278,
            500, 500, 500, 500, 500, 500, 500, 564, 500, 500, 500, 500, 500, 500, 500, 500
        ],
        bold: [
            250, 333, 555, 500, 500, 1000, 833, 278, 333, 333, 500, 570, 250, 333, 250, 278,
            500, 500, 500, 500, 500, 500, 500, 500, 500, 500, 333, 333, 570, 570, 570, 500,
            930, 722, 667, 722, 722, 667, 611, 778, 778, 389, 500, 778, 667, 944, 722, 778,
            611, 778, 722, 556, 667, 722, 722, 1000, 722, 722, 667, 333, 278, 333, 581, 500,
            333, 500, 556, 444, 556, 444, 333, 500, 556, 278, 333, 556, 278, 833, 556, 500,
            556, 556, 444, 389, 333, 556, 500, 722, 500, 500, 444, 394, 220, 394, 520, 0,
            500, 0, 333, 500, 500, 1000, 500, 500, 333, 1000, 556, 333, 1000, 0, 667, 0,
            0, 333, 333, 500, 500, 350, 500, 1000, 333, 1000, 389, 333, 722, 0, 444, 722,
            250, 333, 500, 500, 500, 500, 220, 500, 333, 747, 300, 500, 570, 333, 747, 333,
            400, 570, 300, 300, 333, 556, 540, 250, 333, 300, 330, 500, 750, 750, 750, 500,
            722, 722, 722, 722, 722, 722, 1000, 722, 667, 667, 667, 667, 389, 389, 389, 389,
            722, 722, 778, 778, 778, 778, 778, 570, 778, 722, 722, 722, 722, 722, 611, 556,
            500, 500, 500, 500, 500, 500, 722, 444, 444, 444, 444, 444, 278, 278, 278, 278,
            500, 556, 500, 500, 500, 500, 500, 570, 500, 556, 556, 556, 556, 500, 556, 500
        ],
        italic: [
            250, 333, 420, 500, 500, 833, 778, 214, 333, 333, 500, 675, 250, 333, 250, 278,
            500, 500, 500, 500, 500, 500, 500, 500, 500, 500, 333, 333, 675, 675, 675, 500,
            920, 611, 611, 667, 722, 611, 611, 722, 722, 333, 444, 667, 556, 833, 667, 722,
            611, 722, 611, 500, 556, 722, 611, 833, 611, 556, 556, 389, 278, 389, 422, 500,
            333, 500, 500, 444, 500, 444, 278, 500, 500, 278, 278, 444, 278, 722, 500, 500,
            500, 500, 389, 389, 278, 500, 444, 667, 444, 444, 389, 400, 275, 400, 541, 0,
            500, 0, 333, 500, 556, 889, 500, 500, 333, 1000, 500, 333, 944, 0, 556, 0,
            0, 333, 333, 556, 556, 350, 500, 889, 333, 980, 389, 333, 667, 0, 389, 556,
            250, 389, 500, 500, 500, 500, 275, 500, 333, 760, 276, 500, 675, 333, 760, 333,
            400, 675, 300, 300, 333, 500, 523, 250, 333, 300, 310, 500, 750, 750, 750, 500,
            611, 611, 611, 611, 611, 611, 889, 667, 611, 611, 611, 611, 333, 333, 333, 333,
            722, 667, 722, 722, 722, 722, 722, 675, 722, 722, 722, 722, 722, 556, 611, 500,
            500, 500, 500, 500, 500, 500, 667, 444, 444, 444, 444, 444, 278, 278, 278, 278,
            500, 500, 500, 500, 500, 500, 500, 675, 500, 500, 500, 500, 500, 444, 500, 444
        ],
        bolditalic: [
            250, 389, 555, 500, 500, 833, 778, 278, 333, 333, 500, 570, 250, 333, 250, 278,
            500, 500, 500, 500, 500, 500, 500, 500, 500, 500, 333, 333, 570, 570, 570, 500,
            832, 667, 667, 667, 722, 667, 667, 722, 778, 389, 500, 667, 611, 889, 722, 722,
            611, 722, 667, 556, 611, 722, 667, 889, 667, 611, 611, 333, 278, 333, 570, 500,
            333, 500, 500, 444, 500, 444, 333, 500, 556, 278, 278, 500, 278, 778, 556, 500,
            500, 500, 389, 389, 278, 556, 444, 667, 500, 444, 389, 348, 220, 348, 570, 0,
            500, 0, 333, 500, 500, 1000, 500, 500, 333, 1000, 556, 333, 944, 0, 611, 0,
            0, 333, 333, 500, 500, 350, 500, 1000, 333, 1000, 389, 333, 722, 0, 389, 611,
            250, 389, 500, 500, 500, 500, 220, 500, 333, 747, 266, 500, 606, 333, 747, 333,
            400, 570, 300, 300, 333, 576, 500, 250, 333, 300, 300, 500, 750, 750, 750, 500,
            667, 667, 667, 667, 667, 667, 944, 667, 667, 667, 667, 667, 389, 389, 389, 389,
            722, 722, 722, 722, 722, 722, 722, 570, 722, 722, 722, 722, 722, 611, 611, 500,
            500, 500, 500, 500, 500, 500, 722, 444, 444, 444, 444, 444, 278, 278, 278, 278,
            500, 556, 500, 500, 500, 500, 500, 570, 500, 556, 556, 556, 556, 444, 500, 444
        ],
        heading: [
            278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278,
            556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611,
            975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778,
            667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333, 278, 333, 584, 556,
            333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611,
            611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584, 0,
            556, 0, 278, 556, 500, 1000, 556, 556, 333, 1000, 667, 333, 1000, 0, 611, 0,
            0, 278, 278, 500, 500, 350, 556, 1000, 333, 1000, 556, 333, 944, 0, 500, 667,
            278, 333, 556, 556, 556, 556, 280, 556, 333, 737, 370, 556, 584, 333, 737, 333,
            400, 584, 333, 333, 333, 611, 556, 278, 333, 333, 365, 556, 834, 834, 834, 611,
            722, 722, 722, 722, 722, 722, 1000, 722, 667, 667, 667, 667, 278, 278, 278, 278,
            722, 722, 778, 778, 778, 778, 778, 584, 778, 722, 722, 722, 722, 667, 667, 611,
            556, 556, 556, 556, 556, 556, 889, 556, 556, 556, 556, 556, 278, 278, 278, 278,
            611, 611, 611, 611, 611, 611, 611, 584, 611, 611, 611, 611, 611, 556, 611, 556
        ]
    };

    const FONTS = {
        regular: { resource: 'F1', base: 'Times-Roman' },
        bold: { resource: 'F2', base: 'Times-Bold' },
        italic: { resource: 'F3', base: 'Times-Italic' },
        bolditalic: { resource: 'F4', base: 'Times-BoldItalic' },
        heading: { resource: 'F5', base: 'Helvetica-Bold' },
        mono: { resource: 'F6', base: 'Courier' }
    };

    // Where WinAnsi parts from Latin-1: the 0x80-0x9F row.
    const WIN_ANSI_HIGH = {
        0x20AC: 0x80, 0x201A: 0x82, 0x0192: 0x83, 0x201E: 0x84, 0x2026: 0x85,
        0x2020: 0x86, 0x2021: 0x87, 0x02C6: 0x88, 0x2030: 0x89, 0x0160: 0x8A,
        0x2039: 0x8B, 0x0152: 0x8C, 0x017D: 0x8E, 0x2018: 0x91, 0x2019: 0x92,
        0x201C: 0x93, 0x201D: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97,
        0x02DC: 0x98, 0x2122: 0x99, 0x0161: 0x9A, 0x203A: 0x9B, 0x0153: 0x9C,
        0x017E: 0x9E, 0x0178: 0x9F
    };

    // Characters with a close enough stand-in inside WinAnsi.
    const STAND_INS = {
        0x2010: '-', 0x2011: '-', 0x2012: '-', 0x2212: '-', 0x2015: '—',
        0x2032: "'", 0x2033: '"', 0x2044: '/', 0x2192: '->', 0x2190: '<-',
        0x2264: '<=', 0x2265: '>=', 0x2260: '!=', 0x2248: '~', 0x2116: 'No.',
        0x2007: ' ', 0x202F: ' ',
        // Letters NFD cannot take apart.
        0x0141: 'L', 0x0142: 'l', 0x0110: 'D', 0x0111: 'd', 0x0131: 'i', 0x0126: 'H', 0x0127: 'h'
    };

    const BULLET = '•';

    const PAGE = { width: 595.28, height: 841.89, left: 62, right: 62, top: 68, bottom: 68 };

    const STYLES = {
        title: { font: 'heading', size: 18, leading: 23, after: 4 },
        meta: { font: 'italic', size: 9.5, leading: 13, after: 16, gray: 0.4 },
        para: { size: 11, leading: 15.5, after: 7 },
        heading1: { font: 'heading', size: 14, leading: 18, before: 10, after: 5 },
        heading2: { font: 'heading', size: 12, leading: 16, before: 8, after: 4 },
        item: { size: 11, leading: 15.5, after: 3 },
        caption: { size: 9.5, leading: 13, after: 8, gray: 0.35, italic: true },
        pre: { font: 'mono', size: 8.5, leading: 11.5, after: 8 }
    };

    const INDENT_STEP = 18;
    const LINK_COLOR = '0 0 0.55 rg';

    // --- Text encoding -------------------------------------------------------

    /**
     * One character as WinAnsi, as a string of byte-valued chars: usually one,
     * sometimes a short stand-in, and empty for what is better left out.
     * @param {string} character a single code point
     * @returns {string}
     */
    function encodeChar(character) {
        const code = character.codePointAt(0);
        if ((code >= 0x20 && code <= 0x7E) || (code >= 0xA0 && code <= 0xFF)) {
            return code === 0xAD ? '' : character; // soft hyphen: a hint, not a glyph
        }
        if (WIN_ANSI_HIGH[code]) return String.fromCharCode(WIN_ANSI_HIGH[code]);
        if (STAND_INS[code]) return STAND_INS[code].split('').map(encodeChar).join('');
        if (code >= 0x2000 && code <= 0x200A) return ' ';
        // Zero-width marks, variation selectors, the byte order mark, emoji and
        // pictographs: a "?" in their place would say something they did not.
        if ((code >= 0x200B && code <= 0x200F) || code === 0x2060 || code === 0xFEFF ||
            (code >= 0xFE00 && code <= 0xFE0F) || (code >= 0x2600 && code <= 0x27BF) ||
            (code >= 0x1F000 && code <= 0x1FAFF) || (code >= 0xE0000 && code <= 0xE007F)) {
            return '';
        }
        // A letter WinAnsi lacks may still have its base letter: ő → o, ł stays "?".
        const base = character.normalize('NFD').replace(/[̀-ͯ]/g, '');
        if (base && base !== character && [...base].every(part => encodeChar(part) === part)) return base;
        return '?';
    }

    /**
     * @param {string} text
     * @returns {string} WinAnsi bytes as chars
     */
    function encodeText(text) {
        let result = '';
        for (const character of String(text || '')) result += encodeChar(character);
        return result;
    }

    function charWidth(font, byte) {
        if (font === 'mono') return 600;
        const code = byte.charCodeAt(0);
        return code >= 32 ? (WIDTHS[font][code - 32] || 0) : 0;
    }

    /**
     * Width in points of already-encoded text.
     * @param {string} encoded
     * @param {string} font a key of FONTS
     * @param {number} size
     */
    function textWidth(encoded, font, size) {
        let total = 0;
        for (let i = 0; i < encoded.length; i++) total += charWidth(font, encoded[i]);
        return total * size / 1000;
    }

    // --- HTML to blocks ------------------------------------------------------

    const NAMED = { amp: 38, lt: 60, gt: 62, quot: 34, apos: 39 };

    function decodeEntities(text) {
        const table = (globalThis.EpubTemplates && globalThis.EpubTemplates.NAMED_ENTITIES) || {};
        return text.replace(/&(?:#(\d+)|#[xX]([0-9a-fA-F]+)|([a-zA-Z][a-zA-Z0-9]*));/g, (match, dec, hex, name) => {
            const code = dec ? parseInt(dec, 10) : hex ? parseInt(hex, 16) : (NAMED[name] || table[name]);
            if (!code || code > 0x10FFFF) return match;
            return String.fromCodePoint(code);
        });
    }

    const SKIPPED = new Set(['script', 'style', 'svg', 'noscript', 'template', 'head', 'title', 'button', 'iframe', 'object', 'video', 'audio', 'canvas', 'select', 'math']);
    const BLOCKS = new Set(['p', 'div', 'section', 'article', 'header', 'footer', 'main', 'aside', 'nav', 'figure', 'address', 'center', 'details', 'summary', 'dl', 'dt', 'dd', 'table', 'thead', 'tbody', 'tfoot', 'caption', 'form', 'fieldset', 'body', 'html']);
    const VOID = new Set(['br', 'hr', 'img', 'input', 'meta', 'link', 'area', 'base', 'col', 'embed', 'param', 'source', 'track', 'wbr']);

    function attribute(attributes, name) {
        const match = new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i').exec(attributes || '');
        return match ? decodeEntities(match[1] ?? match[2] ?? match[3] ?? '') : '';
    }

    // Only links a reader can follow from paper's electronic twin.
    function linkTarget(href) {
        return /^(https?:|mailto:)/i.test(href) ? href : '';
    }

    /**
     * The article body as a flat list of blocks, each a run of styled text.
     * @param {string} html sanitized article markup
     * @returns {Array<{kind: string, level?: number, indent: number, marker?: string, runs: Array}>}
     */
    function blocksFromHtml(html) {
        const blocks = [];
        const lists = [];
        const links = [];
        let current = null;
        let bold = 0, italic = 0, mono = 0, pre = 0, quote = 0, skip = 0, cells = 0;

        const indent = () => quote + lists.length;

        function flush() {
            if (!current) return;
            const block = current;
            current = null;
            if (block.kind === 'pre') {
                // The newline right after <pre> is not content, nor the one before </pre>.
                if (block.runs.length) {
                    block.runs[0].text = block.runs[0].text.replace(/^\n/, '');
                    const last = block.runs[block.runs.length - 1];
                    last.text = last.text.replace(/\n\s*$/, '');
                }
            } else {
                // Spaces are only meaningful between words.
                while (block.runs.length && !block.runs[0].text.replace(/^ +/, '')) block.runs.shift();
                if (block.runs.length) block.runs[0].text = block.runs[0].text.replace(/^ +/, '');
                while (block.runs.length && !block.runs[block.runs.length - 1].text.replace(/[ \n]+$/, '')) block.runs.pop();
                if (block.runs.length) {
                    const last = block.runs[block.runs.length - 1];
                    last.text = last.text.replace(/[ \n]+$/, '');
                }
            }
            if (block.runs.some(run => run.text.trim())) blocks.push(block);
        }

        function start(kind, extra = {}) {
            flush();
            current = { kind, indent: indent(), quote: quote > 0, runs: [], ...extra };
        }

        function addText(text) {
            if (!text) return;
            if (!current) start(pre ? 'pre' : 'para');
            const previous = current.runs[current.runs.length - 1];
            // Collapse the space between two runs as HTML does.
            if (!pre && text.startsWith(' ') && (!previous || / $|\n$/.test(previous.text))) text = text.slice(1);
            if (!text) return;
            const style = { bold: bold > 0, italic: italic > 0, mono: mono > 0 || pre > 0, href: links.find(Boolean) || '' };
            if (previous && previous.bold === style.bold && previous.italic === style.italic &&
                previous.mono === style.mono && previous.href === style.href) {
                previous.text += text;
            } else {
                current.runs.push({ text, ...style });
            }
        }

        const pattern = /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<[!?][^>]*>|<(\/?)([a-zA-Z][a-zA-Z0-9-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>|([^<]+)|</g;
        let match;
        while ((match = pattern.exec(String(html || '')))) {
            const [token, closing, rawName, attributes, text] = match;
            if (text !== undefined || token === '<') {
                if (skip) continue;
                const decoded = decodeEntities(text ?? token);
                // A non-breaking space is not whitespace to collapse: it holds words together.
                addText(pre ? decoded.replace(/\r\n?/g, '\n').replace(/\t/g, '    ') : decoded.replace(/[ \t\n\r\f\v]+/g, ' '));
                continue;
            }
            if (!rawName) continue; // comment, doctype, CDATA
            const name = rawName.toLowerCase();
            const selfClosing = /\/\s*$/.test(attributes || '');

            if (SKIPPED.has(name)) {
                if (VOID.has(name) || selfClosing) continue;
                skip += closing ? -1 : 1;
                if (skip < 0) skip = 0;
                continue;
            }
            if (skip) continue;

            if (closing) {
                switch (name) {
                    case 'b': case 'strong': bold = Math.max(0, bold - 1); break;
                    case 'i': case 'em': case 'cite': case 'var': case 'dfn': italic = Math.max(0, italic - 1); break;
                    case 'code': case 'kbd': case 'samp': case 'tt': mono = Math.max(0, mono - 1); break;
                    case 'a': links.pop(); break;
                    case 'pre': flush(); pre = Math.max(0, pre - 1); break;
                    case 'blockquote': flush(); quote = Math.max(0, quote - 1); break;
                    case 'ul': case 'ol': flush(); lists.pop(); break;
                    case 'td': case 'th': cells++; break;
                    case 'tr': flush(); cells = 0; break;
                    default:
                        if (BLOCKS.has(name) || /^h[1-6]$/.test(name) || name === 'li' || name === 'figcaption') flush();
                }
                continue;
            }

            switch (name) {
                case 'b': case 'strong': bold++; break;
                case 'i': case 'em': case 'cite': case 'var': case 'dfn': italic++; break;
                case 'code': case 'kbd': case 'samp': case 'tt': mono++; break;
                case 'a': links.push(linkTarget(attribute(attributes, 'href'))); break;
                case 'img': {
                    // Only the pictures ArticleImages made; an address on the
                    // internet is not something a PDF can hold.
                    const picture = /^x3img:(\d+)$/.exec(attribute(attributes, 'src'));
                    if (picture) {
                        flush();
                        blocks.push({ kind: 'image', index: Number(picture[1]), indent: indent(), runs: [] });
                    }
                    break;
                }
                case 'br': addText('\n'); break;
                case 'hr': flush(); blocks.push({ kind: 'rule', indent: indent(), runs: [] }); break;
                case 'pre': pre++; start('pre'); break;
                case 'blockquote': flush(); quote++; break;
                case 'ul': flush(); lists.push({ ordered: false, next: 1 }); break;
                case 'ol': {
                    flush();
                    const first = parseInt(attribute(attributes, 'start'), 10);
                    lists.push({ ordered: true, next: Number.isFinite(first) ? first : 1 });
                    break;
                }
                case 'li': {
                    const list = lists[lists.length - 1];
                    const marker = list && list.ordered ? `${list.next++}.` : BULLET;
                    start('item', { marker });
                    current.indent = Math.max(1, indent());
                    break;
                }
                case 'figcaption': start('caption'); break;
                case 'tr': flush(); cells = 0; break;
                case 'td': case 'th':
                    // A table row reads as one line, its cells apart.
                    if (cells && current) addText('  ·  ');
                    break;
                default: {
                    const heading = /^h([1-6])$/.exec(name);
                    if (heading) start('heading', { level: Number(heading[1]) });
                    else if (BLOCKS.has(name)) flush();
                }
            }
        }
        flush();
        return blocks;
    }

    // --- Pictures ------------------------------------------------------------

    // The largest version first: the PDF is read on screens and paper, not on a
    // six-inch reader.
    const PICTURE_VERSIONS = ['kindle', 'x3'];

    // Pictures are handled as byte strings, one char per byte, like the file.
    function readUint32(bytes, offset) {
        return ((bytes.charCodeAt(offset) << 24) >>> 0) + (bytes.charCodeAt(offset + 1) << 16) +
            (bytes.charCodeAt(offset + 2) << 8) + bytes.charCodeAt(offset + 3);
    }

    // Size and channels from a JPEG's frame header; PDF takes the JPEG as it is.
    function jpegInfo(bytes) {
        if (bytes.charCodeAt(0) !== 0xFF || bytes.charCodeAt(1) !== 0xD8) return null;
        let i = 2;
        while (i + 9 < bytes.length) {
            if (bytes.charCodeAt(i) !== 0xFF) return null;
            const marker = bytes.charCodeAt(i + 1);
            if (marker === 0xFF) { i++; continue; }
            const length = (bytes.charCodeAt(i + 2) << 8) | bytes.charCodeAt(i + 3);
            const isFrame = marker >= 0xC0 && marker <= 0xCF && marker !== 0xC4 && marker !== 0xC8 && marker !== 0xCC;
            if (isFrame) {
                return {
                    height: (bytes.charCodeAt(i + 5) << 8) | bytes.charCodeAt(i + 6),
                    width: (bytes.charCodeAt(i + 7) << 8) | bytes.charCodeAt(i + 8),
                    components: bytes.charCodeAt(i + 9)
                };
            }
            i += 2 + length;
        }
        return null;
    }

    /* A PNG's compressed pixels go into the PDF untouched: PDF decompresses
       with the same zlib and undoes the same per-row filters (Predictor 15).
       8-bit gray or RGB without interlacing only - what ArticleImages writes;
       anything else is left out rather than drawn wrong. */
    function pngInfo(bytes) {
        if (bytes.slice(0, 8) !== '\x89PNG\r\n\x1a\n') return null;
        let i = 8;
        let info = null;
        let data = '';
        while (i + 8 <= bytes.length) {
            const length = readUint32(bytes, i);
            const type = bytes.slice(i + 4, i + 8);
            const body = bytes.slice(i + 8, i + 8 + length);
            if (type === 'IHDR') {
                info = { width: readUint32(body, 0), height: readUint32(body, 4), depth: body.charCodeAt(8), colorType: body.charCodeAt(9), interlace: body.charCodeAt(12) };
            } else if (type === 'IDAT') {
                data += body;
            } else if (type === 'IEND') {
                break;
            }
            i += 12 + length;
        }
        const colors = info && { 0: 1, 2: 3 }[info.colorType];
        if (!info || !colors || info.depth !== 8 || info.interlace !== 0 || !data) return null;
        return { width: info.width, height: info.height, colors, data };
    }

    /**
     * The image object for one of the article's pictures, or null.
     * @returns {{width: number, height: number, dictionary: string, stream: string}|null}
     */
    function pictureObject(image) {
        const version = PICTURE_VERSIONS.map(name => image && image[name]).find(v => v && v.base64);
        if (!version) return null;
        const bytes = atob(version.base64);
        if (version.type === 'image/jpeg') {
            const info = jpegInfo(bytes);
            const space = info && { 1: '/DeviceGray', 3: '/DeviceRGB' }[info.components];
            if (!space) return null;
            return {
                width: info.width,
                height: info.height,
                dictionary: `/Type /XObject /Subtype /Image /Width ${info.width} /Height ${info.height} /ColorSpace ${space} /BitsPerComponent 8 /Filter /DCTDecode`,
                stream: bytes
            };
        }
        if (version.type === 'image/png') {
            const info = pngInfo(bytes);
            if (!info) return null;
            return {
                width: info.width,
                height: info.height,
                dictionary: `/Type /XObject /Subtype /Image /Width ${info.width} /Height ${info.height} /ColorSpace ${info.colors === 1 ? '/DeviceGray' : '/DeviceRGB'} /BitsPerComponent 8 /Filter /FlateDecode /DecodeParms << /Predictor 15 /Colors ${info.colors} /BitsPerComponent 8 /Columns ${info.width} >>`,
                stream: info.data
            };
        }
        return null;
    }

    // --- Layout --------------------------------------------------------------

    function fontFor(run, base) {
        if (run.mono) return 'mono';
        if (base === 'heading') return 'heading';
        const bold = run.bold || base === 'bold' || base === 'bolditalic';
        const italic = run.italic || base === 'italic' || base === 'bolditalic';
        return bold && italic ? 'bolditalic' : bold ? 'bold' : italic ? 'italic' : 'regular';
    }

    /**
     * Break styled runs into lines no wider than `width`. A word longer than a
     * whole line (a URL, usually) is cut where it has to be.
     * @returns {Array<Array<{text: string, font: string, width: number, href: string}>>}
     */
    function wrap(runs, style, width) {
        const size = style.size;
        const lines = [];
        let line = [];
        let lineWidth = 0;
        let word = [];
        let pendingSpace = null;

        const pushLine = () => {
            lines.push(line);
            line = [];
            lineWidth = 0;
            pendingSpace = null;
        };

        const append = (fragment) => {
            const last = line[line.length - 1];
            if (last && last.font === fragment.font && last.href === fragment.href) {
                last.text += fragment.text;
                last.width += fragment.width;
            } else {
                line.push({ ...fragment });
            }
            lineWidth += fragment.width;
        };

        const placeWord = () => {
            if (!word.length) return;
            const wordWidth = word.reduce((total, fragment) => total + fragment.width, 0);
            const spaceWidth = pendingSpace ? pendingSpace.width : 0;
            if (line.length && lineWidth + spaceWidth + wordWidth > width) pushLine();
            if (line.length && pendingSpace) append(pendingSpace);
            pendingSpace = null;
            for (const fragment of word) {
                if (lineWidth + fragment.width <= width || !line.length && fragment.width <= width) {
                    append(fragment);
                    continue;
                }
                // Too long for any line: cut it, character by character.
                for (const byte of fragment.text) {
                    const piece = { ...fragment, text: byte, width: charWidth(fragment.font, byte) * size / 1000 };
                    if (line.length && lineWidth + piece.width > width) pushLine();
                    append(piece);
                }
            }
            word = [];
        };

        for (const run of runs) {
            const font = fontFor(run, style.font || (style.italic ? 'italic' : 'regular'));
            const parts = run.text.split(/(\n| +)/);
            for (const part of parts) {
                if (!part) continue;
                if (part === '\n') {
                    placeWord();
                    pushLine();
                } else if (part.startsWith(' ')) {
                    placeWord();
                    // Inside <pre> every space counts; elsewhere one is enough.
                    const text = run.mono && style.font === 'mono' ? part : ' ';
                    const encoded = encodeText(text);
                    const space = { text: encoded, font, width: textWidth(encoded, font, size), href: run.href };
                    if (style.font === 'mono') {
                        if (line.length && lineWidth + space.width > width) pushLine();
                        append(space);
                    } else if (line.length) {
                        pendingSpace = space;
                    }
                } else {
                    const encoded = encodeText(part);
                    if (encoded) word.push({ text: encoded, font, width: textWidth(encoded, font, size), href: run.href });
                }
            }
        }
        placeWord();
        if (line.length) lines.push(line);
        return lines;
    }

    function metaLines(article) {
        const blocks = [];
        const parts = [article.author, article.date].map(value => String(value || '').trim()).filter(Boolean);
        if (parts.length) blocks.push([{ text: parts.join(' · '), bold: false, italic: false, mono: false, href: '' }]);
        const url = linkTarget(String(article.url || article.sourceUrl || ''));
        if (url) blocks.push([{ text: url, bold: false, italic: false, mono: false, href: url }]);
        return blocks;
    }

    /**
     * Lay the article out onto A4 pages.
     * @param {Map<number, {name: string, width: number, height: number}>} [pictures] by index in article.images
     * @returns {Array<{ops: string[], links: Array<{rect: number[], uri: string}>, pictures: Set<number>}>}
     */
    function layout(article, pictures = new Map()) {
        const pages = [];
        let page = null;
        let y = 0;
        const contentWidth = PAGE.width - PAGE.left - PAGE.right;

        const newPage = () => {
            page = { ops: [], links: [], pictures: new Set() };
            pages.push(page);
            y = PAGE.height - PAGE.top;
        };
        newPage();

        const ensure = (height) => {
            if (y - height < PAGE.bottom && y < PAGE.height - PAGE.top) newPage();
        };

        const drawLine = (line, x, style) => {
            const baseline = y - style.size;
            const gray = style.gray !== undefined ? `${style.gray} g` : '0 g';
            let cursor = x;
            for (const segment of line) {
                if (segment.text) {
                    const color = segment.href ? LINK_COLOR : gray;
                    page.ops.push(`BT ${color} /${FONTS[segment.font].resource} ${style.size} Tf ${fixed(cursor)} ${fixed(baseline)} Td (${escapePdfString(segment.text)}) Tj ET`);
                    if (segment.href) {
                        page.links.push({ rect: [cursor, baseline - style.size * 0.22, cursor + segment.width, baseline + style.size * 0.78], uri: segment.href });
                    }
                }
                cursor += segment.width;
            }
            y -= style.leading;
        };

        const paragraph = (runs, style, indent = 0, { marker = '', quote = false } = {}) => {
            const x = PAGE.left + indent;
            // A quotation reads as one: in italics, with a bar down its left side.
            if (quote && !style.font) style = { ...style, italic: true };
            const lines = wrap(runs, style, contentWidth - indent);
            if (style.before && y < PAGE.height - PAGE.top) y -= style.before;
            // A heading does not end a page alone.
            ensure(style.leading * (style.font === 'heading' ? 3 : 1));
            lines.forEach((line, index) => {
                ensure(style.leading);
                if (index === 0 && marker) {
                    const encoded = encodeText(marker);
                    const markerWidth = textWidth(encoded, 'regular', style.size);
                    drawLine([{ text: encoded, font: 'regular', width: markerWidth, href: '' }], x - markerWidth - 5, { ...style, leading: 0 });
                }
                if (quote) {
                    const bar = fixed(x - 9);
                    page.ops.push(`0.75 G 1.5 w ${bar} ${fixed(y + 1)} m ${bar} ${fixed(y - style.leading + 1)} l S`);
                }
                drawLine(line, x, style);
            });
            y -= style.after || 0;
        };

        paragraph([{ text: article.title || 'Untitled', bold: false, italic: false, mono: false, href: '' }], STYLES.title);
        const meta = metaLines(article);
        meta.forEach((runs, index) => paragraph(runs, { ...STYLES.meta, after: index === meta.length - 1 ? STYLES.meta.after : 0 }));

        for (const block of blocksFromHtml(article.body)) {
            const indent = block.indent * INDENT_STEP;
            switch (block.kind) {
                case 'heading':
                    paragraph(block.runs, block.level <= 2 ? STYLES.heading1 : STYLES.heading2, indent, { quote: block.quote });
                    break;
                case 'item':
                    paragraph(block.runs, STYLES.item, indent, { marker: block.marker, quote: block.quote });
                    break;
                case 'caption':
                    paragraph(block.runs, STYLES.caption, indent, { quote: block.quote });
                    break;
                case 'pre':
                    paragraph(block.runs, STYLES.pre, indent, { quote: block.quote });
                    break;
                case 'rule':
                    ensure(14);
                    y -= 6;
                    page.ops.push(`0.7 G 0.5 w ${fixed(PAGE.left + indent)} ${fixed(y)} m ${fixed(PAGE.width - PAGE.right)} ${fixed(y)} l S`);
                    y -= 10;
                    break;
                case 'image': {
                    const picture = pictures.get(block.index);
                    if (!picture) break;
                    // Pixels at 96 per inch, so a small picture is not blown
                    // up; a large one fills the column, and a tall one the page.
                    const room = contentWidth - indent;
                    const pageHeight = PAGE.height - PAGE.top - PAGE.bottom;
                    let width = Math.min(room, picture.width * 0.75);
                    let height = width * picture.height / picture.width;
                    if (height > pageHeight) {
                        width *= pageHeight / height;
                        height = pageHeight;
                    }
                    y -= 4;
                    ensure(height);
                    const x = PAGE.left + indent + (room - width) / 2;
                    page.ops.push(`q ${fixed(width)} 0 0 ${fixed(height)} ${fixed(x)} ${fixed(y - height)} cm /${picture.name} Do Q`);
                    page.pictures.add(block.index);
                    y -= height + 10;
                    break;
                }
                default:
                    paragraph(block.runs, STYLES.para, indent, { quote: block.quote });
            }
        }

        // Page numbers only once the count is known.
        pages.forEach((current, index) => {
            const label = `${index + 1} / ${pages.length}`;
            const width = textWidth(label, 'regular', 8.5);
            current.ops.push(`BT 0.5 g /F1 8.5 Tf ${fixed((PAGE.width - width) / 2)} ${fixed(PAGE.bottom / 2)} Td (${label}) Tj ET`);
        });
        return pages;
    }

    // --- PDF file ------------------------------------------------------------

    function fixed(value) {
        return (Math.round(value * 100) / 100).toString();
    }

    /**
     * Escape WinAnsi bytes for a PDF literal string. Anything outside
     * printable ASCII goes as an octal escape, so the file stays ASCII and a
     * byte offset is a string index.
     */
    function escapePdfString(encoded) {
        let result = '';
        for (let i = 0; i < encoded.length; i++) {
            const character = encoded[i];
            const code = character.charCodeAt(0);
            if (character === '\\' || character === '(' || character === ')') result += `\\${character}`;
            else if (code < 32 || code > 126) result += `\\${code.toString(8).padStart(3, '0')}`;
            else result += character;
        }
        return result;
    }

    // Metadata may be in any script: UTF-16 with a byte order mark is how PDF says so.
    function textString(text) {
        let hex = 'FEFF';
        const value = String(text || '');
        for (let i = 0; i < value.length; i++) hex += value.charCodeAt(i).toString(16).padStart(4, '0').toUpperCase();
        return `<${hex}>`;
    }

    function asciiUri(uri) {
        return uri.replace(/[^\x21-\x7E]/g, character => encodeURIComponent(character)).replace(/[\\()]/g, character => `\\${character}`);
    }

    function pdfDate(date) {
        const pad = value => String(value).padStart(2, '0');
        return `D:${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
    }

    /**
     * @param {{title?: string, author?: string, date?: string, body?: string, url?: string, sourceUrl?: string}} article
     * @param {Date} [now] injectable so tests are stable
     * @returns {Uint8Array}
     */
    function build(article, now = new Date()) {
        // A picture PDF cannot read is left out, like one the EPUB cannot hold.
        const pictures = new Map();
        ((article && article.images) || []).forEach((image, index) => {
            try {
                const picture = pictureObject(image);
                if (picture) pictures.set(index, { ...picture, name: `Im${index}` });
            } catch (error) {
                // Not base64 after all: no picture, and the text still goes out.
            }
        });
        const pages = layout(article || {}, pictures);
        const objects = [];
        const add = (content) => {
            objects.push(content);
            return objects.length;
        };
        const reserve = () => add(null);

        const catalogId = reserve();
        const pagesId = reserve();
        const fontIds = {};
        for (const [key, font] of Object.entries(FONTS)) {
            fontIds[key] = add(`<< /Type /Font /Subtype /Type1 /BaseFont /${font.base} /Encoding /WinAnsiEncoding >>`);
        }
        const fontResources = Object.entries(FONTS).map(([key, font]) => `/${font.resource} ${fontIds[key]} 0 R`).join(' ');

        // One object per picture actually placed, shared by the pages that show it.
        const pictureIds = new Map();
        for (const page of pages) {
            for (const index of page.pictures) {
                if (pictureIds.has(index)) continue;
                const picture = pictures.get(index);
                pictureIds.set(index, add(`<< ${picture.dictionary} /Length ${picture.stream.length} >>\nstream\n${picture.stream}\nendstream`));
            }
        }

        const pageIds = pages.map(page => {
            const shown = [...page.pictures].map(index => `/${pictures.get(index).name} ${pictureIds.get(index)} 0 R`);
            const pictureResources = shown.length ? ` /XObject << ${shown.join(' ')} >>` : '';
            const stream = page.ops.join('\n');
            const contentId = add(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
            const annotIds = page.links.map(link => add(
                `<< /Type /Annot /Subtype /Link /Rect [${link.rect.map(fixed).join(' ')}] /Border [0 0 0] /A << /S /URI /URI (${asciiUri(link.uri)}) >> >>`));
            const annots = annotIds.length ? ` /Annots [${annotIds.map(id => `${id} 0 R`).join(' ')}]` : '';
            return add(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${PAGE.width} ${PAGE.height}] /Resources << /Font << ${fontResources} >>${pictureResources} >> /Contents ${contentId} 0 R${annots} >>`);
        });

        objects[catalogId - 1] = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`;
        objects[pagesId - 1] = `<< /Type /Pages /Kids [${pageIds.map(id => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`;

        const info = [`/Title ${textString(article && article.title || 'Untitled')}`, '/Creator (Send to X3)', `/CreationDate (${pdfDate(now)})`];
        if (article && article.author) info.push(`/Author ${textString(article.author)}`);
        const infoId = add(`<< ${info.join(' ')} >>`);

        // The binary comment line tells transfer tools this is not text.
        let file = '%PDF-1.4\n%âãÏÓ\n';
        const offsets = [];
        objects.forEach((content, index) => {
            offsets.push(file.length);
            file += `${index + 1} 0 obj\n${content}\nendobj\n`;
        });
        const xrefAt = file.length;
        file += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
        for (const offset of offsets) file += `${String(offset).padStart(10, '0')} 00000 n \n`;
        file += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R /Info ${infoId} 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`;

        const bytes = new Uint8Array(file.length);
        for (let i = 0; i < file.length; i++) bytes[i] = file.charCodeAt(i);
        return bytes;
    }

    /**
     * The EPUB's name with the PDF's extension, so the two copies of one
     * article are recognisably the same.
     * @param {string} epubFilename
     */
    function filenameFor(epubFilename) {
        return String(epubFilename || 'article.epub').replace(/\.epub$/i, '') + '.pdf';
    }

    return { build, filenameFor, blocksFromHtml, encodeText, textWidth, wrap, STYLES };
})();

// Expose for classic scripts, ES modules (globalThis), and Node tests (CommonJS)
globalThis.PdfBuilder = PdfBuilder;
if (typeof module !== 'undefined' && module.exports) {
    module.exports = PdfBuilder;
}
