/* Drops the page furniture the fallback extraction drags in with the article.

   The fallback reads innerText off the biggest block on the page and splits it
   on blank lines, so whatever the site renders inside that block comes along:
   ad slots, the byline broken into one line per name, the comment counter, the
   author biographies. In a WSJ article measured on 22/09/2026, 45% of the
   characters in the finished EPUB were not the article.

   This runs on the fallback only. Readability already removes this material,
   and on the paths where it succeeds there is nothing here to fix. */

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
