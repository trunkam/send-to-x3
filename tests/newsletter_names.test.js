const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const NewsletterNames = require('../src/utils/newsletter_names.js');

const RCS_URL = 'https://links.newsletter.rcsmediagroup.it/email_browser_view?uid=67e8&utid=67e8-Newsletter_COR_WHATEVERITTAKES&bsft_tv=1891';

beforeEach(() => NewsletterNames.load({}));

describe('NewsletterNames.findMarker', () => {
    it('reads the campaign marker out of a tracking address', () => {
        assert.equal(NewsletterNames.findMarker(RCS_URL), 'WHATEVERITTAKES');
    });

    it('finds it among the tracking links inside the body', () => {
        assert.equal(NewsletterNames.findMarker('<a href="https://x/track?utid=y-Newsletter_COR_ilpunto">l</a>'), 'ILPUNTO');
    });

    it('says nothing when the mailing system left no marker', () => {
        assert.equal(NewsletterNames.findMarker('https://www.corriere.it/economia/articolo.shtml'), '');
        assert.equal(NewsletterNames.findMarker(), '');
        assert.equal(NewsletterNames.findMarker(null, undefined, ''), '');
    });
});

describe('NewsletterNames.detect', () => {
    it('knows the one it was seeded with', () => {
        assert.equal(NewsletterNames.detect(RCS_URL), 'Whatever It Takes');
    });

    it('does not invent a name for a newsletter it has never seen', () => {
        assert.equal(NewsletterNames.detect('https://x/?utid=y-Newsletter_COR_ILPUNTO'), '');
    });

    it('recognises one it was taught, and only under its own marker', () => {
        NewsletterNames.remember('ILPUNTO', 'Il Punto');
        assert.equal(NewsletterNames.detect('https://x/?utid=y-Newsletter_COR_ILPUNTO'), 'Il Punto');
        assert.equal(NewsletterNames.detect('https://x/?utid=y-Newsletter_COR_DATAROOM'), '');
    });

    it('is case-insensitive about the marker, since addresses are not consistent', () => {
        NewsletterNames.remember('dataroom', 'Dataroom');
        assert.equal(NewsletterNames.detect('https://x/?utid=y-Newsletter_COR_DATAROOM'), 'Dataroom');
    });
});

describe('NewsletterNames learning', () => {
    it('hands back the whole table, which is what gets stored', () => {
        NewsletterNames.remember('ILPUNTO', 'Il Punto');
        const table = NewsletterNames.remember('DATAROOM', 'Dataroom');
        assert.deepEqual(table, { ILPUNTO: 'Il Punto', DATAROOM: 'Dataroom' });
    });

    it('reads back what was stored, and ignores junk', () => {
        NewsletterNames.load({ ILPUNTO: 'Il Punto', '': 'nowhere', DATAROOM: '   ' });
        assert.deepEqual(NewsletterNames.learned, { ILPUNTO: 'Il Punto' });
    });

    it('refuses to learn an empty name, so a cleared field cannot erase a title', () => {
        NewsletterNames.remember('ILPUNTO', '   ');
        assert.deepEqual(NewsletterNames.learned, {});
    });

    it('forgets one when asked', () => {
        NewsletterNames.load({ ILPUNTO: 'Il Punto', DATAROOM: 'Dataroom' });
        assert.deepEqual(NewsletterNames.forget('ilpunto'), { DATAROOM: 'Dataroom' });
    });
});
