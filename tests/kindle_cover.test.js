const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const KindleCover = require('../src/epub/kindle_cover.js');

// Every character 10 units wide at size 10: width grows with length and size.
const measure = (text, size) => text.length * size;

describe('KindleCover.publication', () => {
    it('gives every article of a known site the same name, whatever the page declared', () => {
        assert.equal(KindleCover.publication({ sourceUrl: 'https://www.wsj.com/economy/x', publication: 'The Wall Street Journal' }), 'WSJ');
        assert.equal(KindleCover.publication({ sourceUrl: 'https://www.barrons.com/livecoverage/y' }), "Barron's");
    });

    it('takes the name the page declared for a site it does not know', () => {
        assert.equal(KindleCover.publication({ sourceUrl: 'https://technicismi.substack.com/p/z', publication: 'Technicismi' }), 'Technicismi');
    });

    it('reads a newsletter from its Substack address when the page only says Substack', () => {
        assert.equal(KindleCover.publication({ sourceUrl: 'https://technicismi.substack.com/p/z', publication: 'Substack' }), 'Technicismi');
        assert.equal(KindleCover.publication({ sourceUrl: 'https://substack.com/home/post/p-1', publication: 'Substack' }), 'Substack');
    });

    it('falls back to the hostname, and to a word when there is none', () => {
        assert.equal(KindleCover.publication({ sourceUrl: 'https://www.example.org/a' }), 'example');
        assert.equal(KindleCover.publication({}), 'Articolo');
    });
});

describe('KindleCover.fit', () => {
    it('keeps the largest size at which the text fits the lines it has', () => {
        const fitted = KindleCover.fit('aaaa bbbb', { maxWidth: 100, maxLines: 1, start: 12, min: 4, step: 2 }, measure);
        assert.equal(fitted.size, 10);
        assert.deepEqual(fitted.lines, ['aaaa bbbb']);
    });

    it('wraps between words rather than shrinking past need', () => {
        const fitted = KindleCover.fit('aaaa bbbb', { maxWidth: 50, maxLines: 2, start: 12, min: 4, step: 2 }, measure);
        assert.equal(fitted.size, 12);
        assert.deepEqual(fitted.lines, ['aaaa', 'bbbb']);
    });

    it('cuts a title too long even at the smallest size, ending in an ellipsis', () => {
        const fitted = KindleCover.fit('aa bb cc dd ee', { maxWidth: 30, maxLines: 2, start: 10, min: 10 }, measure);
        assert.equal(fitted.lines.length, 2);
        assert.equal(fitted.lines[0], 'aa');
        assert.match(fitted.lines[1], /…$/);
        assert.ok(measure(fitted.lines[1], 10) <= 30);
    });
});

describe('KindleCover.draw', () => {
    it('draws nothing where there is no canvas, so the copy goes without a cover', async () => {
        assert.equal(await KindleCover.draw({ title: 't' }), null);
    });
});
