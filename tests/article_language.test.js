const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const ArticleLanguage = require('../src/utils/article_language.js');

const ITALIAN = 'Le startup sono il pezzo dell’economia che si prende i rischi che le grandi aziende non vogliono prendersi, e quando crescono diventano posti di lavoro per la gente del Paese.';
const ENGLISH = 'The startups are the part of the economy that takes the risks which the big companies do not want to take, and when they grow this is where the jobs are from.';

describe('ArticleLanguage.pick', () => {
    it('takes the primary subtag of what the page declares', () => {
        assert.equal(ArticleLanguage.pick('it', ENGLISH), 'it');
        assert.equal(ArticleLanguage.pick('it-IT', ''), 'it');
        assert.equal(ArticleLanguage.pick(' EN_us ', ''), 'en');
    });

    it('reads the text when the page declares nothing, as the iPad HTML does', () => {
        assert.equal(ArticleLanguage.pick('', ITALIAN), 'it');
        assert.equal(ArticleLanguage.pick(undefined, ENGLISH), 'en');
    });

    it('ignores a declaration that is not a language tag', () => {
        assert.equal(ArticleLanguage.pick('{{lang}}', ITALIAN), 'it');
    });

    it('falls back to English when nothing says otherwise', () => {
        assert.equal(ArticleLanguage.pick('', ''), 'en');
        assert.equal(ArticleLanguage.pick('', 'Wave 2027 · OGR Torino'), 'en');
    });
});

describe('the EPUB built from an article', () => {
    // The classic scripts share one scope in the extension; here each installs its global.
    require('../src/utils/sanitize.js');
    require('../src/epub/epub_templates.js');
    globalThis.JSZip = require('../src/epub/jszip.min.js');
    const EpubBuilder = require('../src/epub/epub_builder.js');

    async function declared(article) {
        const zip = await JSZip.loadAsync(await (await EpubBuilder.build(article)).arrayBuffer());
        const opf = await zip.file('OEBPS/content.opf').async('string');
        const page = await zip.file('OEBPS/content.xhtml').async('string');
        return [/<dc:language>(\w+)</.exec(opf)[1], /xml:lang="(\w+)"/.exec(page)[1]];
    }

    it('says Italian for the Substack that used to arrive as English', async () => {
        assert.deepEqual(await declared({ title: 'Le startup europee', author: 'Riccardo Bassetto', language: 'it', body: `<p>${ENGLISH}</p>` }), ['it', 'it']);
    });

    it('links the source the extraction found, under the name it gives it', async () => {
        const blob = await EpubBuilder.build({ title: 't', author: 'a', body: '<p>x</p>', sourceUrl: 'https://technicismi.substack.com/p/x?a=1&b=2' });
        const page = await (await JSZip.loadAsync(await blob.arrayBuffer())).file('OEBPS/content.xhtml').async('string');
        assert.match(page, /<a href="https:\/\/technicismi\.substack\.com\/p\/x\?a=1&amp;b=2">Source<\/a>/);
    });

    it('reads the body of an iPad article, which declares nothing', async () => {
        assert.deepEqual(await declared({ title: 'Corriere', author: '', body: `<p>${ITALIAN}</p>` }), ['it', 'it']);
    });
});

describe('ArticleLanguage.guess', () => {
    it('does not guess from a handful of words', () => {
        assert.equal(ArticleLanguage.guess('il la di'), '');
    });

    it('counts whole words, not pieces of them', () => {
        // "theory", "other", "android": "the" and "and" inside, never alone.
        assert.equal(ArticleLanguage.guess('theory other android '.repeat(5) + ITALIAN), 'it');
    });
});
