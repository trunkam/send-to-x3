const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
require('../src/epub/epub_templates.js');
const PdfBuilder = require('../src/pdf/pdf_builder.js');

const latin1 = bytes => Buffer.from(bytes).toString('latin1');
const text = blocks => blocks.map(block => block.runs.map(run => run.text).join('')).join('|');

describe('PdfBuilder.encodeText', () => {
    it('keeps Italian as it is', () => {
        assert.equal(PdfBuilder.encodeText('Perché è così'), 'Perché è così');
    });

    it('turns typographic quotes and dashes into their WinAnsi bytes', () => {
        assert.equal(PdfBuilder.encodeText('l’“a”—…€'), 'l\x92\x93a\x94\x97\x85\x80');
    });

    it('keeps the base letter of an accent WinAnsi lacks', () => {
        assert.equal(PdfBuilder.encodeText('Ōsaka Łódź'), 'Osaka Lódz');
    });

    it('drops emoji and zero-width marks instead of printing "?"', () => {
        assert.equal(PdfBuilder.encodeText('ok 😀​️'), 'ok ');
    });

    it('marks with "?" a letter it cannot write at all', () => {
        assert.equal(PdfBuilder.encodeText('ω'), '?');
    });
});

describe('PdfBuilder.blocksFromHtml', () => {
    it('makes one block per paragraph, heading and list item', () => {
        const blocks = PdfBuilder.blocksFromHtml('<h2>Title</h2><p>One</p><ul><li>a</li><li>b</li></ul>');
        assert.deepEqual(blocks.map(block => block.kind), ['heading', 'para', 'item', 'item']);
        assert.equal(blocks[0].level, 2);
        assert.equal(blocks[2].marker, '•');
    });

    it('numbers an ordered list from its start', () => {
        const blocks = PdfBuilder.blocksFromHtml('<ol start="3"><li>c</li><li>d</li></ol>');
        assert.deepEqual(blocks.map(block => block.marker), ['3.', '4.']);
    });

    it('collapses whitespace but keeps a non-breaking space', () => {
        const [block] = PdfBuilder.blocksFromHtml('<p>  a \n\t b&nbsp;%  </p>');
        assert.equal(block.runs[0].text, 'a b %');
    });

    it('decodes the entities articles carry, the WSJ ampersand among them', () => {
        assert.equal(text(PdfBuilder.blocksFromHtml('<p>Dow Jones &amp; Company &mdash; &#8217;s &#x2019;</p>')), 'Dow Jones & Company — ’s ’');
    });

    it('carries bold, italics and links on the runs', () => {
        const [block] = PdfBuilder.blocksFromHtml('<p>a <strong>b</strong> <em>c</em> <a href="https://x.it/?a=1&amp;b=2">d</a></p>');
        const runs = Object.fromEntries(block.runs.map(run => [run.text.trim(), run]));
        assert.equal(runs.b.bold, true);
        assert.equal(runs.c.italic, true);
        assert.equal(runs.d.href, 'https://x.it/?a=1&b=2');
    });

    it('leaves out scripts, styles, charts and images', () => {
        const html = '<p>a</p><script>var x = "<p>no</p>";</script><style>p{}</style><svg><text>no</text></svg><img src="x.jpg"><p>b</p>';
        assert.equal(text(PdfBuilder.blocksFromHtml(html)), 'a|b');
    });

    it('keeps the lines and spaces of preformatted text', () => {
        const [block] = PdfBuilder.blocksFromHtml('<pre>\nif (a) {\n    b();\n}\n</pre>');
        assert.equal(block.kind, 'pre');
        assert.equal(block.runs[0].text, 'if (a) {\n    b();\n}');
    });

    it('marks what sits inside a quotation', () => {
        const blocks = PdfBuilder.blocksFromHtml('<p>a</p><blockquote><p>b</p></blockquote><p>c</p>');
        assert.deepEqual(blocks.map(block => block.quote), [false, true, false]);
    });

    it('ignores a paragraph that holds only spaces', () => {
        assert.equal(PdfBuilder.blocksFromHtml('<p> </p><p>&nbsp;</p><div></div>').length, 0);
    });
});

describe('PdfBuilder.wrap', () => {
    const style = PdfBuilder.STYLES.para;
    const run = value => ({ text: value, bold: false, italic: false, mono: false, href: '' });
    const widthOf = line => line.reduce((total, segment) => total + segment.width, 0);

    it('never makes a line wider than asked', () => {
        const lines = PdfBuilder.wrap([run('parola '.repeat(80))], style, 200);
        assert.ok(lines.length > 5);
        for (const line of lines) assert.ok(widthOf(line) <= 200 + 0.01, `${widthOf(line)} > 200`);
    });

    it('cuts a word longer than the line, a URL usually', () => {
        const lines = PdfBuilder.wrap([run(`https://example.com/${'a'.repeat(200)}`)], style, 150);
        assert.ok(lines.length > 1);
        for (const line of lines) assert.ok(widthOf(line) <= 150 + 0.01);
    });

    it('breaks the line at a <br>', () => {
        const lines = PdfBuilder.wrap([run('uno\ndue')], style, 400);
        assert.deepEqual(lines.map(line => line.map(segment => segment.text).join('')), ['uno', 'due']);
    });
});

describe('PdfBuilder.build', () => {
    const article = {
        title: 'L’università e “il resto”',
        author: 'Mario Rossi',
        date: '2026-09-24',
        url: 'https://www.ilpost.it/prova/',
        body: `<p>${'Perché l’Italia è così. '.repeat(400)}</p><p><a href="https://example.com/x">link</a></p>`
    };
    const pdf = latin1(PdfBuilder.build(article, new Date(2026, 8, 24, 12, 0, 0)));

    it('is a PDF from its first byte to its last line', () => {
        assert.ok(pdf.startsWith('%PDF-1.4\n'));
        assert.ok(pdf.endsWith('%%EOF\n'));
    });

    it('has an xref table whose offsets land on their objects', () => {
        const xrefAt = Number(/startxref\n(\d+)\n%%EOF\n$/.exec(pdf)[1]);
        assert.ok(pdf.startsWith('xref\n', xrefAt));
        const [, count] = /^xref\n0 (\d+)\n/.exec(pdf.slice(xrefAt));
        const entries = pdf.slice(xrefAt).split('\n').slice(3, 2 + Number(count));
        entries.forEach((entry, index) => {
            const offset = Number(entry.slice(0, 10));
            assert.ok(pdf.startsWith(`${index + 1} 0 obj\n`, offset), `object ${index + 1}`);
        });
    });

    it('declares a stream length that matches the stream', () => {
        for (const [, length, content] of pdf.matchAll(/<< \/Length (\d+) >>\nstream\n([\s\S]*?)\nendstream/g)) {
            assert.equal(content.length, Number(length));
        }
    });

    it('spreads a long article over pages, numbered', () => {
        const count = Number(/\/Type \/Pages \/Kids \[[^\]]*\] \/Count (\d+)/.exec(pdf)[1]);
        assert.ok(count >= 2, `${count} pages`);
        assert.ok(pdf.includes(`(${count} / ${count}) Tj`));
    });

    it('writes accents and curly quotes as WinAnsi octal escapes', () => {
        // "è" is 0350, "’" 0222 in WinAnsi.
        assert.ok(pdf.includes('l\\222Italia \\350 cos\\354'));
        assert.ok(/\/Encoding \/WinAnsiEncoding/.test(pdf));
    });

    it('makes the source and the links clickable', () => {
        assert.ok(pdf.includes('/URI (https://www.ilpost.it/prova/)'));
        assert.ok(pdf.includes('/URI (https://example.com/x)'));
    });

    it('stays plain ASCII, so byte offsets are string offsets', () => {
        const body = pdf.slice(pdf.indexOf('\n', 10) + 1);
        assert.ok(/^[\x00-\x7F]*$/.test(body));
    });

    it('puts the title in the metadata in any script', () => {
        // UTF-16 with a byte order mark: "L" then "’".
        assert.ok(pdf.includes('/Title <FEFF004C2019'));
    });

    it('survives an article with no body or title', () => {
        const empty = latin1(PdfBuilder.build({}));
        assert.ok(empty.includes('/Count 1'));
    });
});

describe('PdfBuilder.filenameFor', () => {
    it('gives the PDF the name of the EPUB it sits beside', () => {
        assert.equal(PdfBuilder.filenameFor('09-24 Titolo - ilpost.it - 2026-09-24.epub'), '09-24 Titolo - ilpost.it - 2026-09-24.pdf');
    });
});
