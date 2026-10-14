/* One line under the article saying which road it took, shown every time.

   Readability keeps headings, pictures and the author; the fallback reads the
   page as plain text and loses them. Which one ran is the first thing to know
   when an article comes out badly, and on Android there is no console to ask:
   so the popup says it, with the numbers that tell why the fallback ran. */
const ExtractionRoad = {
    describe(article) {
        if (!article || !article.extraction) return '';
        const count = (n) => `${Number(n || 0).toLocaleString()} characters`;

        if (article.extraction === 'readability') {
            return `Read by Readability · ${count(article.readabilityLength)}`;
        }
        if (article.extraction !== 'fallback') return '';

        const parts = ['Read by the fallback'];
        if (article.readabilityLoaded === false) {
            parts.push(article.readabilityInjectError
                ? `Readability did not load: ${article.readabilityInjectError}`
                : 'Readability did not load');
        } else {
            parts.push(`Readability found ${count(article.readabilityLength)}`);
        }
        // Worth naming only when it is an article's worth of text.
        if (article.hiddenLength >= 1000) {
            parts.push(`${count(article.hiddenLength)} marked hidden on the page`);
        }
        return parts.join(' · ');
    }
};

// Expose for classic scripts, ES modules (globalThis), and Node tests (CommonJS)
globalThis.ExtractionRoad = ExtractionRoad;
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ExtractionRoad;
}
