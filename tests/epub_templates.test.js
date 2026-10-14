const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const EpubTemplates = require('../src/epub/epub_templates.js');

// A lone "&" outside a reference is what breaks the reader: XML takes it as the
// start of an entity name, finds none, and stops parsing the file there.
const BARE_AMPERSAND = /&(?!(?:[a-zA-Z][a-zA-Z0-9]*|#[0-9]+|#[xX][0-9a-fA-F]+);)/;

const AMP = '&';

describe('EpubTemplates.xmlSafeEntities', () => {
    it('escapes the ampersand that ends every WSJ article', () => {
        assert.equal(
            EpubTemplates.xmlSafeEntities(`<p>Dow Jones ${AMP} Company, Inc.</p>`),
            '<p>Dow Jones &amp; Company, Inc.</p>'
        );
    });

    it('leaves references that are already valid alone', () => {
        const already = '<p>AT&amp;T &lt;b&gt; &#8212; &#x2014; &quot;q&quot; &apos;a&apos;</p>';
        assert.equal(EpubTemplates.xmlSafeEntities(already), already);
    });

    it('runs twice without escaping its own escapes', () => {
        const once = EpubTemplates.xmlSafeEntities(`Dow Jones ${AMP} Company`);
        assert.equal(once, 'Dow Jones &amp; Company');
        assert.equal(EpubTemplates.xmlSafeEntities(once), once);
    });

    it('turns HTML-only names into numbers XML can read', () => {
        assert.equal(
            EpubTemplates.xmlSafeEntities('a&nbsp;b&mdash;c&hellip;'),
            'a&#160;b&#8212;c&#8230;'
        );
    });

    it('keeps an unknown name readable instead of ill-formed', () => {
        assert.equal(EpubTemplates.xmlSafeEntities('&notaname;'), '&amp;notaname;');
    });

    it('escapes an ampersand that ends the text', () => {
        assert.equal(EpubTemplates.xmlSafeEntities(`Marks ${AMP}`), 'Marks &amp;');
    });
});

describe('EpubTemplates.htmlToXhtml', () => {
    it('still self-closes void elements', () => {
        assert.equal(EpubTemplates.htmlToXhtml('<p>a<br>b</p>'), '<p>a<br />b</p>');
        assert.equal(EpubTemplates.htmlToXhtml('<img src="a.jpg">'), '<img src="a.jpg" />');
    });

    it('does not re-close what is already self-closed', () => {
        assert.equal(EpubTemplates.htmlToXhtml('<br />'), '<br />');
    });

    it('leaves no bare ampersand for the reader to choke on', () => {
        const body = `<p>Dow Jones ${AMP} Company</p><p>M${AMP}S</p><p>a&nbsp;b</p>`;
        assert.equal(BARE_AMPERSAND.test(EpubTemplates.htmlToXhtml(body)), false);
    });
});

describe('EpubTemplates.contentXhtml', () => {
    // The article as the fallback extraction hands it over: the copyright line
    // is the one that used to end the reading session mid-page.
    const page = EpubTemplates.contentXhtml({
        title: 'He’s Letting AI Agents Invest His Money - WSJ',
        author: 'Hannah Erin Lang',
        date: '2026-09-06',
        url: `https://www.wsj.com/finance/a?mod=hp_lead${AMP}pos=1`,
        body: `<p>First paragraph.</p>\n<p>Copyright ©2026 Dow Jones ${AMP} Company, Inc.</p>`
    });

    it('carries the whole article, copyright line included', () => {
        assert.match(page, /First paragraph\./);
        assert.match(page, /Dow Jones &amp; Company, Inc\./);
    });

    it('holds no bare ampersand anywhere - body, metadata or source link', () => {
        assert.equal(BARE_AMPERSAND.test(page), false);
    });

    it('declares the language it is given, English when given none', () => {
        assert.match(page, /xml:lang="en"/);
        assert.match(EpubTemplates.contentXhtml({ title: 't', body: '<p>x</p>', language: 'it' }), /xml:lang="it"/);
    });
});

describe('EpubTemplates.contentOpf', () => {
    it('declares the language it is given, English when given none', () => {
        assert.match(EpubTemplates.contentOpf({ title: 't', uuid: 'u' }), /<dc:language>en<\/dc:language>/);
        assert.match(EpubTemplates.contentOpf({ title: 't', uuid: 'u', language: 'it' }), /<dc:language>it<\/dc:language>/);
    });
});
