const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const ExtractionRoad = require('../src/utils/extraction_road.js');

const n = (value) => Number(value).toLocaleString();

describe('ExtractionRoad.describe', () => {
    it('names Readability and how much it read', () => {
        assert.equal(ExtractionRoad.describe({ extraction: 'readability', readabilityLength: 17196 }),
            `Read by Readability · ${n(17196)} characters`);
    });

    it('says why the fallback ran: what Readability found', () => {
        assert.equal(ExtractionRoad.describe({ extraction: 'fallback', readabilityLoaded: true, readabilityLength: 180 }),
            `Read by the fallback · Readability found ${n(180)} characters`);
    });

    it('tells a Readability that never loaded from one that found nothing', () => {
        assert.equal(ExtractionRoad.describe({ extraction: 'fallback', readabilityLoaded: false, readabilityLength: null }),
            'Read by the fallback · Readability did not load');
        assert.equal(ExtractionRoad.describe({ extraction: 'fallback', readabilityLoaded: true, readabilityLength: 0 }),
            'Read by the fallback · Readability found 0 characters');
    });

    it('carries the reason the injection gave, when it gave one', () => {
        assert.equal(ExtractionRoad.describe({ extraction: 'fallback', readabilityLoaded: false, readabilityInjectError: 'Missing host permission for the tab' }),
            'Read by the fallback · Readability did not load: Missing host permission for the tab');
    });

    it('mentions hidden text only when it is an article’s worth', () => {
        assert.equal(ExtractionRoad.describe({ extraction: 'fallback', readabilityLoaded: true, readabilityLength: 40, hiddenLength: 17000 }),
            `Read by the fallback · Readability found 40 characters · ${n(17000)} characters marked hidden on the page`);
        assert.equal(ExtractionRoad.describe({ extraction: 'fallback', readabilityLoaded: true, readabilityLength: 40, hiddenLength: 300 }),
            'Read by the fallback · Readability found 40 characters');
    });

    it('says nothing for articles that took neither road', () => {
        assert.equal(ExtractionRoad.describe({ title: 'From the iPad' }), '');
        assert.equal(ExtractionRoad.describe(null), '');
    });
});
