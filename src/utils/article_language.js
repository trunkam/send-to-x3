/* The language the EPUB declares, which KOReader goes by for hyphenation and
   for which dictionary to open. It used to be "en" for everything, Italian
   newsletters included.

   The page usually says it: <html lang="it-IT">, kept as its primary subtag.
   The iPad's HTML does not - the Shortcut writes a bare <html> - so there the
   text itself decides, between the two languages the articles arrive in, by
   counting the short words each language cannot write a sentence without. */
const ArticleLanguage = {
    COMMON: {
        it: ['il', 'lo', 'la', 'gli', 'le', 'di', 'che', 'è', 'per', 'non', 'una', 'con', 'del', 'della', 'sono', 'anche'],
        en: ['the', 'of', 'and', 'to', 'is', 'that', 'for', 'with', 'are', 'was', 'this', 'from', 'have', 'which', 'not', 'by']
    },

    // "it-IT", "en_US", " IT " -> "it"; anything that is not a language tag -> ''.
    normalize(declared) {
        const primary = String(declared || '').trim().toLowerCase().split(/[-_]/)[0];
        return /^[a-z]{2,3}$/.test(primary) ? primary : '';
    },

    guess(text) {
        const words = String(text || '').toLowerCase().match(/[\p{L}]+/gu) || [];
        const counts = {};
        for (const [language, common] of Object.entries(this.COMMON)) {
            const set = new Set(common);
            counts[language] = words.filter(word => set.has(word)).length;
        }
        // Too little text to tell, or a tie: no guess rather than a wrong one.
        if (counts.it === counts.en || Math.max(counts.it, counts.en) < 5) return '';
        return counts.it > counts.en ? 'it' : 'en';
    },

    pick(declared, text) {
        return this.normalize(declared) || this.guess(text) || 'en';
    }
};

// Expose for classic scripts, ES modules (globalThis), and Node tests (CommonJS)
globalThis.ArticleLanguage = ArticleLanguage;
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ArticleLanguage;
}
