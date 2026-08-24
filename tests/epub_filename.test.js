const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

// epub_builder.js reaches for Sanitizer as a global, the way the manifest's
// classic scripts share one scope. Requiring sanitize.js first installs it.
require('../src/utils/sanitize.js');
const EpubBuilder = require('../src/epub/epub_builder.js');

const article = {
    title: 'How encryption actually works',
    author: 'Jane Doe',
    sourceUrl: 'https://www.example.com/crypto',
    date: '2019-03-12'
};

describe('EpubBuilder.generateFilename', () => {
    it('leads with the send date, month and day only', () => {
        const name = EpubBuilder.generateFilename(article, new Date(2026, 7, 24, 12, 0));
        assert.ok(name.startsWith('08-24 How encryption actually works'), name);
    });

    it('pads month and day, so name order is date order on the device', () => {
        const on = (year, month, day) => EpubBuilder.generateFilename(article, new Date(year, month - 1, day, 12, 0));
        const names = [on(2026, 12, 31), on(2026, 2, 1), on(2026, 1, 10), on(2026, 1, 1)];

        assert.deepEqual([...names].sort(), [on(2026, 1, 1), on(2026, 1, 10), on(2026, 2, 1), on(2026, 12, 31)]);
        assert.ok(names.every(name => /^\d{2}-\d{2} /.test(name)), names.join('\n'));
    });

    it('uses the local calendar day at both ends of the day, not the UTC one', () => {
        const justAfterMidnight = EpubBuilder.generateFilename(article, new Date(2026, 0, 5, 0, 30));
        const lateEvening = EpubBuilder.generateFilename(article, new Date(2026, 0, 5, 23, 30));

        assert.ok(justAfterMidnight.startsWith('01-05 '), justAfterMidnight);
        assert.ok(lateEvening.startsWith('01-05 '), lateEvening);
    });

    it('prefixes the send date without displacing the publication date', () => {
        const name = EpubBuilder.generateFilename(article, new Date(2026, 7, 24, 12, 0));

        // What file_manager.parseDateFromFilename looks for when it sorts the
        // device list. The prefix must not be what it finds.
        assert.equal(name.match(/(\d{4}-\d{2}-\d{2})/)[1], '2019-03-12');
        assert.ok(name.endsWith('2019-03-12.epub'), name);
    });

    it('falls back to today when the page declares no publication date', () => {
        const { date, ...undated } = article;
        const name = EpubBuilder.generateFilename(undated, new Date(2026, 7, 24, 12, 0));

        assert.ok(name.startsWith('08-24 '), name);
        assert.equal(name.match(/(\d{4}-\d{2}-\d{2})/)[1], new Date().toISOString().split('T')[0]);
    });

    it('still names an untitled article', () => {
        const name = EpubBuilder.generateFilename({}, new Date(2026, 7, 24, 12, 0));
        // Sanitizer.sanitizeFilename supplies its own lowercase fallback, so
        // the 'Untitled' branch above it never runs. Longstanding, harmless.
        assert.ok(name.startsWith('08-24 untitled'), name);
    });
});
