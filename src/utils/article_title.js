/* The article's title as the reader should see it, not as the browser tab
   shows it.

   Both extraction roads start from document.title, and a site you are logged
   into writes more than the title there. Substack puts the count of unread
   notifications in front - "(1) L'AI ci ucciderà tutti?" - as Facebook,
   LinkedIn and X do, and appends " - by Riccardo Bassetto", which the file
   name then carries twice, since the author goes into it on its own.

   The byline suffix is taken off only when it names the author already found:
   a title that merely contains "by" is left alone. */
const ArticleTitle = {
    // "(1) ", "(12) ", "(99+) " at the very start.
    COUNTER: /^\(\d{1,4}\+?\)\s+/,

    clean(title, author) {
        let result = String(title || '').trim().replace(this.COUNTER, '');
        const name = String(author || '').trim();
        if (name) {
            const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            result = result.replace(new RegExp(`\\s+[-–—|]\\s+by\\s+${escaped}\\s*$`, 'i'), '');
        }
        return result.trim() || String(title || '').trim();
    }
};

// Expose for classic scripts, ES modules (globalThis), and Node tests (CommonJS)
globalThis.ArticleTitle = ArticleTitle;
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ArticleTitle;
}
