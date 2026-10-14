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
    },

    /* What the page held that could be a chart, and how many the capture took:
       "Page 412 px · SVG 340×120, 24×24 · canvas none · Highcharts 340×300 ·
       3 images · 0 charts taken". A diagnosis line, for the phone. */
    describeDrawings(article) {
        const d = article && article.drawings;
        if (!d) return '';
        if (d.error) return `Page not measured: ${d.error}`;
        const list = (sizes) => (sizes && sizes.length ? sizes.map(([w, h]) => `${w}×${h}`).join(', ') : 'none');
        const charts = (article.charts || []).length;
        const parts = [
            `Page ${d.viewport} px${d.visibility && d.visibility !== 'visible' ? ` (${d.visibility})` : ''}`,
            `SVG ${list(d.svgs)}`,
            `canvas ${list(d.canvases)}`,
            `Highcharts ${list(d.highcharts)}`,
            `${d.images} image${d.images === 1 ? '' : 's'}`,
            `${charts} chart${charts === 1 ? '' : 's'} taken`
        ];
        if (article.chartsFailed) parts.push(`${article.chartsFailed} failed`);
        return parts.join(' · ');
    }
};

// Expose for classic scripts, ES modules (globalThis), and Node tests (CommonJS)
globalThis.ExtractionRoad = ExtractionRoad;
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ExtractionRoad;
}
