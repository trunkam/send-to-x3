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

// A newsletter read in the browser is an HTML email: empty <title>, no og:title,
// the text laid out in tables. iOS finds no title to give the Shortcut, which then
// writes an empty <h1> — but the newsletter's own heading carries the title.
describe('HtmlArticle.parse — the Shortcut had no title to write', () => {
    const NEWSLETTER = `<h1></h1><!DOCTYPE html>
<html><head><meta charset="utf-8"><title></title></head>
<body>
<table><tr><td><p>L'Economia spiegata facile</p></td></tr></table>
<table><tr><td><h1 style="color: #0e5084">Malta e la Grecia vendono i loro dati a Sam Altman</h1></td></tr></table>
<p>Un dettaglio ha disturbato il mio riposo estivo.</p>
</body></html>`;
    const article = HtmlArticle.parse(NEWSLETTER, { filename: 'Documento 3.html', date: '2026-08-31' });

    it('takes the title from the first heading that has text', () => {
        assert.equal(article.title, 'Malta e la Grecia vendono i loro dati a Sam Altman');
    });

    it('does not name the article after the file', () => {
        assert.notEqual(article.title, 'Documento 3');
    });

    it('leaves neither heading in the body', () => {
        assert.ok(!/<h1/i.test(article.body));
        assert.ok(!article.body.includes('Malta e la Grecia'));
    });

    it('keeps the newsletter itself', () => {
        assert.ok(article.body.includes('Un dettaglio ha disturbato'));
        assert.ok(article.body.includes("L'Economia spiegata facile"));
    });
});

describe('HtmlArticle.parse — no heading with text anywhere', () => {
    it('prefers the document title to the filename', () => {
        const doc = HtmlArticle.parse('<html><head><title>Whatever It Takes</title></head><body><p>t</p></body></html>', { filename: 'Documento 3.html' });
        assert.equal(doc.title, 'Whatever It Takes');
    });

    it('still falls back to the filename when the title is empty too', () => {
        const doc = HtmlArticle.parse('<h1></h1><html><head><title>  </title></head><body><p>t</p></body></html>', { filename: 'Documento 3.html' });
        assert.equal(doc.title, 'Documento 3');
    });
});

// A newsletter is looked for on the device by its own name, not by the issue's
// headline — so a recognised one takes over the title, and the headline stays
// in the body where it is the only copy left.
describe('HtmlArticle.parse — a newsletter we can name', () => {
    const ISSUE = `<h1></h1><!DOCTYPE html>
<html><head><meta charset="utf-8"><title></title></head>
<body>
<h1>Malta e la Grecia vendono i loro dati a Sam Altman</h1>
<p>Un dettaglio ha disturbato il mio riposo estivo.</p>
<a href="https://links.newsletter.rcsmediagroup.it/track?utid=67e8-Newsletter_COR_WHATEVERITTAKES">Leggi sul sito</a>
</body></html>`;
    const article = HtmlArticle.parse(ISSUE, { filename: 'unknown-links.newsletter.html', date: '2026-08-31' });

    it('is named after the newsletter', () => {
        assert.equal(article.title, 'Whatever It Takes');
    });

    it('keeps the issue headline in the body, since the title no longer carries it', () => {
        assert.ok(article.body.includes('<h1>Malta e la Grecia vendono i loro dati a Sam Altman</h1>'));
    });

    it('still drops the empty heading the Shortcut wrote', () => {
        assert.ok(!/<h1>\s*<\/h1>/i.test(article.body));
    });

    it('leaves an unrecognised newsletter named after its headline', () => {
        const other = HtmlArticle.parse(ISSUE.replace('WHATEVERITTAKES', 'ILPUNTO'), { filename: 'unknown.html' });
        assert.equal(other.title, 'Malta e la Grecia vendono i loro dati a Sam Altman');
        assert.ok(!/<h1/i.test(other.body));
    });
});

// Where the title came from is what the queue uses to decide whether to ask for
// a better one, so it has to be reported honestly.
describe('HtmlArticle.parse — titleSource', () => {
    const NewsletterNames = require('../src/utils/newsletter_names.js');
    const doc = (h1, extra = '') => `<h1>${h1}</h1><html><head><title></title></head><body>${extra}<p>testo</p></body></html>`;
    const rcsLink = '<a href="https://links.newsletter.rcsmediagroup.it/track?utid=x-Newsletter_COR_WHATEVERITTAKES">l</a>';

    it('says "heading" when the document named the article', () => {
        assert.equal(HtmlArticle.parse(doc('Titolo vero'), { filename: 'a.html' }).titleSource, 'heading');
    });

    it('says "newsletter" when the name came from a known campaign', () => {
        assert.equal(HtmlArticle.parse(doc('', rcsLink), { filename: 'a.html' }).titleSource, 'newsletter');
    });

    it('says "document-title" when only the <title> had something', () => {
        const withTitle = '<html><head><title>Whatever It Takes</title></head><body><p>t</p></body></html>';
        assert.equal(HtmlArticle.parse(withTitle, { filename: 'a.html' }).titleSource, 'document-title');
    });

    it('says "filename" when nothing in the document named it', () => {
        const parsed = HtmlArticle.parse(doc(''), { filename: 'unknown-links.newsletter.html' });
        assert.equal(parsed.titleSource, 'filename');
        assert.equal(parsed.title, 'unknown-links.newsletter');
    });

    it('carries the campaign marker, so a correction can be filed under it', () => {
        const unknown = doc('', '<a href="https://x/track?utid=y-Newsletter_COR_ILPUNTO">l</a>');
        const parsed = HtmlArticle.parse(unknown, { filename: 'unknown.html' });
        assert.equal(parsed.titleSource, 'filename');
        assert.equal(parsed.campaign, 'ILPUNTO');
    });

    it('names the next issue by itself, once that correction is remembered', () => {
        const issue = doc('', '<a href="https://x/track?utid=y-Newsletter_COR_ILPUNTO">l</a>');
        NewsletterNames.remember('ILPUNTO', 'Il Punto');
        try {
            const parsed = HtmlArticle.parse(issue, { filename: 'unknown.html' });
            assert.equal(parsed.title, 'Il Punto');
            assert.equal(parsed.titleSource, 'newsletter');
        } finally {
            NewsletterNames.forget('ILPUNTO');
        }
    });
});
