/* Drops the page furniture the fallback extraction drags in with the article.

   The fallback reads innerText off the biggest block on the page and splits it
   on blank lines, so whatever the site renders inside that block comes along:
   ad slots, the byline broken into one line per name, the comment counter, the
   author biographies. In a WSJ article measured on 22/09/2026, 45% of the
   characters in the finished EPUB were not the article.

   stripChrome() runs on the fallback's paragraphs. Readability removes most of
   this material by itself, but not all: what it keeps - the end of a newsletter,
   the copyright and the biographies under a WSJ piece, a sponsor's section, an
   audio player - stripMarkup() takes off its HTML, with the same lists. */

const ArticleCleanup = {
    // Past one of these the page has stopped being the article: what follows is
    // copyright, biographies, comments, "read next" teasers. Cutting the tail
    // in one move is worth more than any per-paragraph rule - in the measured
    // article it accounted for 2.634 of the 2.905 dropped characters.
    END_MARKERS: [
        /^copyright\s*©/i,
        /^©\s*\d{4}\b/,
        /^show conversation\b/i,
        /^further reading$/i,
        /^related reading$/i,
        /^most popular$/i,
        /^what to read next$/i,
        // Italian sites close the article the same way, with different words.
        // "© RIPRODUZIONE RISERVATA" ends every Corriere piece, and the box of
        // unrelated headlines sits under it.
        /^©?\s*riproduzione riservata$/i,
        /^tutti i diritti riservati/i,
        /^leggi anche$/i,
        /^articoli correlati$/i,
        /^(ti )?potrebbe interessar(ti|e)$/i,
        // A newsletter ends in its own furniture - share, comment, like counts.
        // These also sit in CHROME_LINES: met early they are dropped one by one,
        // met past the sixty per cent mark they mean the piece is over.
        /^(condividi|share)$/i,
        /^(lascia un commento|leave a comment)$/i,
        /^info$/i,
        /^\d+\s+likes?\b/i
    ],

    // Stand-alone labels for things an e-reader cannot show anyway.
    CHROME_LINES: [
        /^advertisement$/i,
        /^sponsored( content)?$/i,
        /^share$/i,
        /^save$/i,
        /^gift (this )?article$/i,
        /^listen( to article)?$/i,
        /^videos?$/i,
        /^photos?$/i,
        /^newsletter sign[- ]?up$/i,
        /^continue reading$/i,
        /^comments?( \(\d+\))?$/i,
        /^skip to \S+/i,
        // The credit of a picture that stayed on the page.
        /^(photo|image) credits?:/i,
        // The same furniture in Italian.
        /^pubblicit[àa]$/i,
        /^annuncio( pubblicitario)?$/i,
        /^condividi$/i,
        /^lascia un commento$/i,
        /^commenti?( \(\d+\))?$/i,
        /^info$/i,
        /^iscriviti( ora)?$/i,
        /^abbonati$/i,
        /^ascolta$/i
    ],

    // What the extraction leaves where a picture was: see ArticleImages.marker.
    IMAGE_MARKER: /^\[\[x3-image:\d+\]\]$/,

    // A paragraph this long is prose, not a label: it anchors the rules that
    // need to know where the article proper starts.
    BODY_LENGTH: 200,
    // Shorter than this, before the first real paragraph, is byline debris.
    CRUMB_LENGTH: 40,
    // A label is short. Refusing to drop a long paragraph that merely begins
    // with "Save" keeps the rules above from eating prose.
    LABEL_LENGTH: 60,
    // Only cut the tail once most of the text is behind us, so an article that
    // mentions its own copyright early is not truncated at the top.
    TAIL_POSITION: 0.6,
    // Enough shared opening for two paragraphs to be the same text twice: a
    // site's AI summary repeating the lede verbatim.
    DUPLICATE_LENGTH: 80,

    // A photo credit shouts in capitals and names two parties across a slash:
    // "CHIP SOMODEVILLA/GETTY IMAGES", "SETH WENIG/AP". The slash alone is not
    // enough - "AC/DC" ends a sentence the same way - so the shouting has to run
    // for eight characters too. Measured on a real article, the pair caught all
    // three captions and nothing else in forty-five paragraphs.
    PHOTO_CREDIT: /[A-Z][A-Z .\/-]{7,}$/,

    /* Returns { kept, dropped }, where dropped carries the rule that removed
       each paragraph so the popup can say what it threw away instead of
       silently shortening the article. */
    stripChrome(paragraphs) {
        const all = (paragraphs || []).map(p => String(p == null ? '' : p).trim())
            .filter(p => p.length > 0);
        if (all.length === 0) return { kept: [], dropped: [] };

        const dropped = [];
        const drop = (text, rule) => { dropped.push({ text, rule }); };

        const afterTail = this.cutTail(all, drop);
        const firstBody = afterTail.findIndex(p => p.length >= this.BODY_LENGTH);

        const kept = afterTail.filter((paragraph, index) => {
            // A picture's stand-in is short like byline debris, and is not.
            if (this.IMAGE_MARKER.test(paragraph)) return true;
            if (this.isChromeLine(paragraph)) { drop(paragraph, 'chrome'); return false; }
            if (this.isAiNotice(paragraph)) { drop(paragraph, 'ai-notice'); return false; }
            if (this.isOrphanCaption(paragraph)) { drop(paragraph, 'caption'); return false; }
            if (this.isCrumb(paragraph, index, firstBody)) { drop(paragraph, 'byline'); return false; }
            if (this.isRepeatedLater(paragraph, afterTail, index)) { drop(paragraph, 'duplicate'); return false; }
            return true;
        });

        return { kept, dropped };
    },

    /* Turns kept paragraphs into the article body.

       This is page text on its way into a file that gets parsed as XML, so all
       three of XML's dangerous characters have to go - the ampersand included.
       A WSJ article ends on "Dow Jones & Company": left bare, that one character
       makes the EPUB ill-formed from there to the end and the X3 stops turning
       pages. The ampersand goes first, or it would escape its own escapes.

       It lives here, next to the only caller, because the last time this escape
       existed twice one copy was dead code and the live one was the incomplete
       one. */
    toBody(paragraphs) {
        const asXmlText = (text) => text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
        return (paragraphs || []).map((p) => {
            const text = String(p).trim();
            // The picture itself is added by ArticleImages, which reads this src.
            if (this.IMAGE_MARKER.test(text)) {
                return `<div class="x3-image"><img src="${text.slice(2, -2)}" alt=""/></div>`;
            }
            return `<p>${asXmlText(text)}</p>`;
        }).join('\n');
    },

    // A heading opening a section that is someone else's advertising: the
    // section runs to the next heading of the same rank or higher.
    SPONSOR_HEADING: /\b(supportat[oa] da|sponsorizzat[oa] da|offert[oa] da|in collaborazione con|sponsored by|brought to you by|presented by|in partnership with)\b/i,

    // A player's own line, "Ascolta questo episodio grazie a ElevenLabs".
    PLAYER_LINE: /\b(ascolta|listen)\b/i,

    // The elements whose text the rules read and which they remove whole. Whole
    // elements only: a body cut in the middle of a <div> is not XML any more,
    // and the X3 stops turning pages at the first error in the file.
    BLOCK: /<(p|h[1-6]|li|figure|blockquote|pre|table)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,

    // The text of a piece of HTML, as the rules expect to read it.
    textOf(html) {
        return String(html || '')
            .replace(/<[^>]*>/g, ' ')
            .replace(/&nbsp;|&#160;/gi, ' ')
            .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
            .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
            .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
            .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
            .replace(/\s+/g, ' ')
            .trim();
    },

    /* The Readability road: the same furniture, taken off HTML.
       - players: an <audio> or <video> (with the text it shows when it cannot
         play) is nothing on an e-reader, and a short line presenting it goes
         with it;
       - labels: CHROME_LINES, on short blocks;
       - sponsor: a section under a SPONSOR_HEADING;
       - tail: from an END_MARKERS block past TAIL_POSITION of the text, every
         block to the end.
       @returns {{body: string, dropped: Array<{text: string, rule: string}>}} */
    stripMarkup(body) {
        let html = String(body || '');
        const dropped = [];

        // Players first, so their fallback text weighs nothing below.
        // Where each player was, in the body once players are out of it.
        const playerAt = [];
        let removed = 0;
        html = html.replace(/<(audio|video)\b[^>]*>[\s\S]*?<\/\1\s*>|<(audio|video)\b[^>]*\/>/gi, (player, _a, _b, offset) => {
            dropped.push({ text: this.textOf(player), rule: 'player' });
            playerAt.push(offset - removed);
            removed += player.length;
            return '';
        });

        const blocks = [...html.matchAll(this.BLOCK)].map(match => ({
            start: match.index,
            end: match.index + match[0].length,
            tag: match[1].toLowerCase(),
            // An element holding one of its own kind was matched to the inner
            // closing tag: removing it would leave a stray one behind.
            whole: !new RegExp(`<${match[1]}\\b`, 'i').test(match[0].slice(1)),
            text: this.textOf(match[0])
        }));
        const remove = new Set();
        const drop = (index, rule) => {
            if (!blocks[index].whole || remove.has(index)) return;
            remove.add(index);
            if (blocks[index].text) dropped.push({ text: blocks[index].text, rule });
        };

        // The line presenting a player: the nearest block before where it was.
        for (const at of playerAt) {
            let previous = -1;
            blocks.forEach((block, index) => { if (block.end <= at && block.text) previous = index; });
            const line = blocks[previous];
            if (line && line.text.length <= this.LABEL_LENGTH * 2 && this.PLAYER_LINE.test(line.text)) {
                drop(previous, 'player');
            }
        }

        blocks.forEach((block, index) => {
            if (block.text && this.isChromeLine(block.text)) drop(index, 'chrome');
        });

        blocks.forEach((block, index) => {
            const rank = /^h([1-6])$/.exec(block.tag);
            if (!rank || !this.SPONSOR_HEADING.test(block.text)) return;
            for (let i = index; i < blocks.length; i++) {
                const next = /^h([1-6])$/.exec(blocks[i].tag);
                if (i > index && next && Number(next[1]) <= Number(rank[1])) break;
                drop(i, 'sponsor');
            }
        });

        const total = blocks.reduce((sum, block) => sum + block.text.length, 0);
        let seen = 0;
        for (let i = 0; i < blocks.length; i++) {
            const isMarker = this.END_MARKERS.some(marker => marker.test(blocks[i].text));
            if (isMarker && seen >= total * this.TAIL_POSITION) {
                for (let j = i; j < blocks.length; j++) drop(j, 'tail');
                break;
            }
            seen += blocks[i].text.length;
        }

        // From the back, so the positions still to use stay right.
        [...remove].sort((a, b) => b - a).forEach(index => {
            html = html.slice(0, blocks[index].start) + html.slice(blocks[index].end);
        });
        // A paragraph that only held a player is left empty.
        html = html.replace(/<p\b[^>]*>\s*<\/p\s*>/gi, '');
        return { body: html, dropped };
    },

    cutTail(paragraphs, drop) {
        const total = paragraphs.reduce((sum, p) => sum + p.length, 0);
        let seen = 0;
        for (let i = 0; i < paragraphs.length; i++) {
            const isMarker = this.END_MARKERS.some(marker => marker.test(paragraphs[i]));
            if (isMarker && seen >= total * this.TAIL_POSITION) {
                paragraphs.slice(i).forEach(p => drop(p, 'tail'));
                return paragraphs.slice(0, i);
            }
            seen += paragraphs[i].length;
        }
        return paragraphs;
    },

    isChromeLine(paragraph) {
        return paragraph.length <= this.LABEL_LENGTH &&
            this.CHROME_LINES.some(line => line.test(paragraph));
    },

    isAiNotice(paragraph) {
        return /\bwas (generated|created|written) (with|by) ai\b/i.test(paragraph);
    },

    // The byline arrives as one paragraph per fragment - "By", each name, the
    // comma between them, the timestamp - because the site lays them out as
    // blocks. They only look like debris before the article has started.
    isCrumb(paragraph, index, firstBody) {
        return firstBody > 0 && index < firstBody && paragraph.length < this.CRUMB_LENGTH;
    },

    /* A photo credit in capitals says nothing on an e-reader. It was written
       for captions with no picture above them, when the EPUB carried none;
       pictures are back, but a credit line under one is still noise, so the
       rule stays. It takes a caption ending in a credit along with it. */
    isOrphanCaption(paragraph) {
        const credit = paragraph.match(this.PHOTO_CREDIT);
        return Boolean(credit && credit[0].includes('/'));
    },

    // A summary box that quotes the opening of the article leaves the same
    // sentences in the file twice. Keep the later, longer one.
    isRepeatedLater(paragraph, paragraphs, index) {
        if (paragraph.length < this.DUPLICATE_LENGTH) return false;
        const opening = paragraph.slice(0, this.DUPLICATE_LENGTH);
        return paragraphs.slice(index + 1).some(other =>
            other.length > paragraph.length && other.startsWith(opening));
    }
};

// Expose for classic scripts, ES modules (globalThis), and Node tests (CommonJS)
globalThis.ArticleCleanup = ArticleCleanup;
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ArticleCleanup;
}
