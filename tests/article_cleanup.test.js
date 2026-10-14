const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const ArticleCleanup = require('../src/utils/article_cleanup.js');

// Long enough to count as prose under BODY_LENGTH, so the rules that need to
// know where the article starts have something to anchor on.
const prose = (seed) => `${seed} `.repeat(30).trim();

const kept = (paragraphs) => ArticleCleanup.stripChrome(paragraphs).kept;
const rules = (paragraphs) => ArticleCleanup.stripChrome(paragraphs).dropped.map(d => d.rule);

describe('ArticleCleanup.stripChrome - the tail', () => {
    it('cuts the copyright line and everything under it', () => {
        const result = kept([
            prose('body one'),
            prose('body two'),
            'Copyright ©2026 Dow Jones & Company, Inc. All Rights Reserved. 87990cbe',
            'Philip Wegmann is a White House reporter for The Wall Street Journal.',
            'Show Conversation (146)',
            'Further Reading',
            'Videos'
        ]);
        assert.deepEqual(result, [prose('body one'), prose('body two')]);
    });

    it('leaves a marker alone when it turns up before the article is over', () => {
        // A piece *about* copyright opens on the word: cutting there would throw
        // the article away instead of its furniture.
        const paragraphs = [
            'Copyright ©2026 is the subject of this piece.',
            prose('body one'),
            prose('body two'),
            prose('body three')
        ];
        assert.equal(kept(paragraphs).length, 4);
    });

    it('names the rule that removed each paragraph', () => {
        const dropped = ArticleCleanup.stripChrome([
            prose('body'),
            prose('more body'),
            'Advertisement',
            'Most Popular',
            'Some teaser headline'
        ]).dropped;
        assert.deepEqual(dropped.map(d => d.rule), ['tail', 'tail', 'chrome']);
    });
});

describe('ArticleCleanup.stripChrome - stand-alone labels', () => {
    it('drops the ad slots and the comment counter', () => {
        const result = kept([prose('body'), 'Advertisement', 'Comments (12)', prose('more')]);
        assert.deepEqual(result, [prose('body'), prose('more')]);
    });

    it('keeps a paragraph that merely starts with a label word', () => {
        const paragraph = 'Save the date: the summit opens on Tuesday morning in New York.';
        assert.deepEqual(kept([prose('body'), paragraph, prose('more')])[1], paragraph);
    });
});

describe('ArticleCleanup.stripChrome - the byline', () => {
    it('drops the fragments the site lays out as separate blocks', () => {
        const result = kept([
            'By', 'Philip Wegmann', ',', 'Alexander Ward', 'Sept. 22, 2026 10:50 am ET',
            prose('the article itself')
        ]);
        assert.deepEqual(result, [prose('the article itself')]);
    });

    it('leaves short paragraphs alone once the article has started', () => {
        const result = kept([prose('opening'), 'He paused.', prose('closing')]);
        assert.equal(result.length, 3);
    });

    it('keeps everything when no paragraph is long enough to anchor on', () => {
        const paragraphs = ['A short note.', 'Another one.'];
        assert.deepEqual(kept(paragraphs), paragraphs);
    });
});

describe('ArticleCleanup.stripChrome - summary boxes', () => {
    it('drops a summary that repeats the opening of a later paragraph', () => {
        const lede = 'President Trump defended his foreign-policy record during remarks to the United Nations on Tuesday.';
        const result = kept([prose('x'), lede, `${lede} He spoke for almost an hour.`]);
        assert.deepEqual(result, [prose('x'), `${lede} He spoke for almost an hour.`]);
    });

    it('drops the notice that the summary came from a machine', () => {
        const notice = 'This summary was generated with AI and reviewed by an editor.';
        assert.equal(rules([prose('x'), notice, prose('y')]).length, 1);
        assert.deepEqual(rules([prose('x'), notice, prose('y')]), ['ai-notice']);
    });
});

describe('ArticleCleanup.stripChrome - captions with no picture', () => {
    it('drops a caption that ends in a photo credit', () => {
        const result = kept([
            'President Trump addressing the U.N. General Assembly. CHIP SOMODEVILLA/GETTY IMAGES',
            'Secretary of State Marco Rubio in New York on Tuesday. SETH WENIG/AP',
            prose('body')
        ]);
        assert.deepEqual(result, [prose('body')]);
    });

    it('keeps a sentence that merely ends on a slashed acronym', () => {
        const paragraph = 'The band that closed the night was AC/DC.';
        assert.deepEqual(kept([prose('body'), paragraph, prose('more')])[1], paragraph);
    });
});

describe('ArticleCleanup.stripChrome - edges', () => {
    it('survives nothing at all', () => {
        assert.deepEqual(ArticleCleanup.stripChrome([]), { kept: [], dropped: [] });
        assert.deepEqual(ArticleCleanup.stripChrome(null), { kept: [], dropped: [] });
        assert.deepEqual(ArticleCleanup.stripChrome([null, '', '   ']), { kept: [], dropped: [] });
    });

    it('leaves a clean article exactly as it was', () => {
        const paragraphs = [prose('one'), prose('two'), prose('three')];
        const once = kept(paragraphs);
        assert.deepEqual(once, paragraphs);
        assert.deepEqual(kept(once), paragraphs);
    });
});

describe('ArticleCleanup.toBody', () => {
    it('escapes the ampersand that used to cut a WSJ article in half', () => {
        const line = 'Copyright ©2026 Dow Jones & Company, Inc. All Rights Reserved.';
        assert.equal(ArticleCleanup.toBody([line]),
            '<p>Copyright ©2026 Dow Jones &amp; Company, Inc. All Rights Reserved.</p>');
    });

    it('escapes the ampersand before the angle brackets, not after', () => {
        // The other order would escape its own escapes: & -> &amp; -> &amp;amp;
        assert.equal(ArticleCleanup.toBody(['a < b & c > d']), '<p>a &lt; b &amp; c &gt; d</p>');
    });

    it('puts one paragraph per line and trims them', () => {
        assert.equal(ArticleCleanup.toBody(['  one  ', 'two']), '<p>one</p>\n<p>two</p>');
    });

    it('survives nothing at all', () => {
        assert.equal(ArticleCleanup.toBody([]), '');
        assert.equal(ArticleCleanup.toBody(null), '');
    });

    it('turns a picture stand-in back into a picture for ArticleImages to fill', () => {
        assert.equal(ArticleCleanup.toBody(['one', '[[x3-image:2]]']),
            '<p>one</p>\n<div class="x3-image"><img src="x3-image:2" alt=""/></div>');
    });
});

describe('ArticleCleanup.stripChrome - pictures', () => {
    it('keeps a chart that sits above the first paragraph of prose', () => {
        // Short, and before the prose starts: exactly what byline debris looks like.
        const { kept } = ArticleCleanup.stripChrome(['By', '[[x3-image:0]]', prose('paragraph')]);
        assert.deepEqual(kept, ['[[x3-image:0]]', prose('paragraph')]);
    });

    it('still cuts a picture that sits in the tail with the comments', () => {
        const paragraphs = [prose('a'), prose('b'), prose('c'), 'Show Conversation (12)', '[[x3-image:1]]'];
        const { kept } = ArticleCleanup.stripChrome(paragraphs);
        assert.equal(kept.includes('[[x3-image:1]]'), false);
    });
});

describe('ArticleCleanup.stripChrome - Italian pages', () => {
    it('ends the article at "© RIPRODUZIONE RISERVATA"', () => {
        // Measured on a Corriere piece: the line closes every article and the
        // box of unrelated headlines sits under it.
        const result = kept([
            prose('il discorso'),
            prose('la replica'),
            '22 settembre 2026, 15:39 - Aggiornata il 22 settembre 2026 , 18:19',
            '© RIPRODUZIONE RISERVATA',
            'Le tue notizie\nNOTIZIE\n«Ciao Serena, sul tuo volo c\'è il mio ragazzo»'
        ]);
        assert.deepEqual(result.slice(0, 2), [prose('il discorso'), prose('la replica')]);
        assert.equal(result.some(p => p.includes('Le tue notizie')), false);
    });

    it('drops the Italian furniture labels', () => {
        const result = kept([prose('corpo'), 'Pubblicità', 'Commenti (12)', prose('altro corpo')]);
        assert.deepEqual(result, [prose('corpo'), prose('altro corpo')]);
    });

    it('cuts a newsletter tail at its share and comment links', () => {
        const result = kept([
            prose('la puntata'), prose('il ragionamento'), prose('la conclusione'),
            'Info',
            'Se questo episodio ti è piaciuto, puoi cliccare sul cuoricino.',
            'Condividi',
            'Lascia un commento',
            '35 Likes\n∙\n4 Restacks'
        ]);
        assert.equal(result.length, 3);
    });

    it('still drops those labels one by one when they turn up early', () => {
        // Same words before the sixty per cent mark: a label, not the end.
        const paragraphs = [
            'Condividi', prose('uno'), prose('due'), prose('tre'), prose('quattro')
        ];
        const result = kept(paragraphs);
        assert.equal(result.length, 4);
        assert.equal(result[0], prose('uno'));
    });
});

describe('ArticleCleanup.stripMarkup', () => {
    const prose = (n) => `<p>${'Paragrafo di prosa vera dell’articolo, abbastanza lungo da pesare. '.repeat(3)}${n}</p>`;
    const article = Array.from({ length: 8 }, (_, i) => prose(i)).join('');

    it('takes off a player, its fallback text and the line presenting it', () => {
        const body = '<div><p><em>Ascolta questo episodio grazie a <a href="x">ElevenLabs</a></em></p>' +
            '<p><audio src="a.mp3">La riproduzione audio non è supportata dal tuo browser.</audio></p>' +
            `<h5>La storia della settimana</h5>${article}</div>`;
        const { body: cleaned, dropped } = ArticleCleanup.stripMarkup(body);
        assert.equal(/audio|Ascolta|non è supportata/.test(cleaned), false);
        assert.ok(cleaned.startsWith('<div><h5>La storia della settimana</h5>'));
        assert.deepEqual(dropped.map(d => d.rule), ['player', 'player']);
    });

    it('keeps a line before a player that does not present it', () => {
        const body = `${prose('a')}<video src="v.mp4"></video>${article}`;
        const { body: cleaned } = ArticleCleanup.stripMarkup(body);
        assert.ok(cleaned.startsWith(prose('a')));
        assert.equal(cleaned.includes('video'), false);
    });

    it('drops a sponsor section up to the next heading of its rank', () => {
        const body = `${article}<h5>Questo episodio è supportato da Wave</h5><p>Acquista il tuo pass</p>` +
            '<ul><li><p>Startup: per founder</p></li></ul><h6>Prezzi</h6><p>€100</p>' +
            '<h5>Il toolkit di Technicismi</h5><p>Le cose più interessanti della settimana.</p>';
        const { body: cleaned } = ArticleCleanup.stripMarkup(body);
        assert.equal(/Wave|pass|Startup|Prezzi|€100/.test(cleaned), false);
        assert.ok(cleaned.endsWith('<h5>Il toolkit di Technicismi</h5><p>Le cose più interessanti della settimana.</p>'));
    });

    it('cuts the tail from the copyright line, biographies included', () => {
        const body = `<div>${article}<p>Photo credit: Angela Weiss/AFP/Getty Images</p>` +
            '<p>Copyright ©2026 Dow Jones &amp; Company, Inc. All Rights Reserved.</p>' +
            '<p>Konrad Putzier is an economics reporter at The Wall Street Journal.</p></div>';
        const { body: cleaned, dropped } = ArticleCleanup.stripMarkup(body);
        assert.equal(cleaned, `<div>${article}</div>`);
        assert.deepEqual(dropped.map(d => d.rule), ['chrome', 'tail', 'tail']);
    });

    it('does not cut at a marker met before most of the text', () => {
        const body = `<p>Info</p><p>Condividi</p>${prose('x')}<p>Copyright © 2026 early mention</p>${article}`;
        const { body: cleaned } = ArticleCleanup.stripMarkup(body);
        assert.ok(cleaned.includes('early mention'));
        assert.ok(cleaned.endsWith(prose(7)));
        assert.equal(/<p>Info<\/p>|<p>Condividi<\/p>/.test(cleaned), false);
    });

    it('never leaves a tag open, and leaves alone an element it cannot remove whole', () => {
        const nested = '<blockquote><blockquote><p>Info</p></blockquote></blockquote>';
        const body = `<div><section>${article}</section>${nested}<p>Lascia un commento</p></div>`;
        const { body: cleaned } = ArticleCleanup.stripMarkup(body);
        const count = (re) => (cleaned.match(re) || []).length;
        assert.equal(count(/<blockquote\b/g), count(/<\/blockquote>/g));
        assert.equal(count(/<div\b/g), count(/<\/div>/g));
        assert.equal(count(/<p\b/g), count(/<\/p>/g));
        assert.equal(cleaned.includes('Lascia un commento'), false);
    });

    it('changes nothing in an article with none of the furniture', () => {
        assert.deepEqual(ArticleCleanup.stripMarkup(article), { body: article, dropped: [] });
    });
});
