const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const HtmlArticle = require('../src/utils/html_article.js');

const SHORTCUT_OUTPUT = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>ignored</title></head>
<body><h1>Reddit stock price</h1>
<p data-testid="paragraph" font-size="16">First paragraph with a <a href="https://x.com">link</a>.</p>
<svg xmlns="http://www.w3.org/2000/svg" width="600">
<path d="M 0 185.42 L 12 180.1"></path>
</svg>
<p>Second paragraph.</p></body></html>`;

describe('HtmlArticle.isHtmlFilename', () => {
    it('recognises what the Shortcut saves', () => {
        assert.equal(HtmlArticle.isHtmlFilename('Documento 3.html'), true);
        assert.equal(HtmlArticle.isHtmlFilename('page.HTM'), true);
        assert.equal(HtmlArticle.isHtmlFilename('book.epub'), false);
        assert.equal(HtmlArticle.isHtmlFilename('notes.txt'), false);
        assert.equal(HtmlArticle.isHtmlFilename(''), false);
    });
});

describe('HtmlArticle.stripSvg', () => {
    it('removes a chart that spans several lines', () => {
        assert.equal(HtmlArticle.stripSvg('<p>a</p><svg>\n<path d="M 0 1"/>\n</svg><p>b</p>'), '<p>a</p><p>b</p>');
    });

    it('removes every chart, not just the first', () => {
        assert.equal(HtmlArticle.stripSvg('<svg>1</svg>x<SVG>2</SVG>'), 'x');
    });

    it('leaves markup without charts alone', () => {
        assert.equal(HtmlArticle.stripSvg('<p>plain</p>'), '<p>plain</p>');
    });
});

describe('HtmlArticle.parse', () => {
    const article = HtmlArticle.parse(SHORTCUT_OUTPUT, { filename: 'Documento 3.html', date: '2026-08-25' });

    it('takes the title from the h1 the Shortcut writes', () => {
        assert.equal(article.title, 'Reddit stock price');
    });

    it('drops that h1 from the body, because the EPUB template writes its own', () => {
        assert.ok(!/<h1/i.test(article.body));
        assert.ok(!article.body.includes('Reddit stock price'));
    });

    it('keeps the paragraphs and their links', () => {
        assert.ok(article.body.includes('First paragraph'));
        assert.ok(article.body.includes('Second paragraph.'));
        assert.ok(article.body.includes('href="https://x.com"'));
    });

    it('drops the chart', () => {
        assert.ok(!article.body.includes('<svg'));
        assert.ok(!article.body.includes('185.42'));
    });

    it('keeps the head out of the body', () => {
        assert.ok(!article.body.includes('<meta'));
        assert.ok(!article.body.includes('ignored'));
    });

    it('uses the date it is given', () => {
        assert.equal(article.date, '2026-08-25');
    });

    it('falls back to the filename when there is no h1', () => {
        const untitled = HtmlArticle.parse('<html><body><p>text</p></body></html>', { filename: 'Documento 3.html' });
        assert.equal(untitled.title, 'Documento 3');
        assert.equal(untitled.body, '<p>text</p>');
    });

    it('reads the address when the Shortcut supplies one, and copes when it does not', () => {
        const withUrl = HtmlArticle.parse('<html><head><link rel="canonical" href="https://barrons.com/a"></head><body><p>t</p></body></html>', { filename: 'a.html' });
        assert.equal(withUrl.sourceUrl, 'https://barrons.com/a');
        assert.equal(article.sourceUrl, '');
    });

    it('survives a fragment with no html or body element', () => {
        const fragment = HtmlArticle.parse('<h1>Title</h1><p>body</p>', { filename: 'a.html' });
        assert.equal(fragment.title, 'Title');
        assert.equal(fragment.body, '<p>body</p>');
    });

    it('dates today when no date is given', () => {
        assert.match(HtmlArticle.parse('<p>x</p>', { filename: 'a.html' }).date, /^\d{4}-\d{2}-\d{2}$/);
    });
});

// The real files put the <h1> before the doctype, outside <body>.
describe('HtmlArticle.parse — heading outside the body', () => {
    const REAL = `<h1>The choices we make about AI now are critical | Bill Gates</h1>
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
</head>
<body>

<p>During my entire life I\u2019ve only had two jobs.</p>
<h2>A section</h2>
<p>Another <em>paragraph</em>.</p>
</body>
</html>`;
    const article = HtmlArticle.parse(REAL, { filename: 'The choices we make about AI now are critical  Bill Gates.html' });

    it('still finds the title', () => {
        assert.equal(article.title, 'The choices we make about AI now are critical | Bill Gates');
    });

    it('does not leave it in the body', () => {
        assert.ok(!/<h1/i.test(article.body));
    });

    it('keeps the article itself', () => {
        assert.ok(article.body.includes('During my entire life'));
        assert.ok(article.body.includes('<h2>A section</h2>'));
        assert.ok(article.body.includes('<em>paragraph</em>'));
        assert.ok(!article.body.includes('<meta'));
    });
});
