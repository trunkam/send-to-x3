/* Handing a file to the browser's own download manager, for the browsers where
   the downloads API cannot do it.

   Firefox for Android has no downloads API at all: it went away with Fenix and
   the bug asking for it back is still open, so `browser.downloads` is simply
   undefined there and calling it throws. Firefox everywhere also rejects
   `data:` URLs in downloads.download, at schema validation, which is what the
   worker's fallback builds.

   What every browser does have is a link. An <a download> pointing at a blob:
   URL is the page asking for a save, so it goes to the browser's own download
   manager - the one that on Android shows the notification and drops the file
   in /Download. The link only works from a page, which is why this lives in the
   popup and not in the background worker.

   The object URL is revoked on a timer rather than straight away: revoking it
   before the download has been picked up cancels the download. */
const BlobDownload = {
    REVOKE_AFTER_MS: 60000,

    /**
     * @param {Blob} blob - the file to save
     * @param {string} filename - the name to suggest for it
     * @param {Object} [environment] - injectable for tests
     * @returns {string} the object URL that was handed to the browser
     */
    save(blob, filename, environment = {}) {
        const doc = environment.document || globalThis.document;
        const urls = environment.url || globalThis.URL;
        const later = environment.setTimeout || globalThis.setTimeout;

        const objectUrl = urls.createObjectURL(blob);
        const link = doc.createElement('a');
        link.href = objectUrl;
        link.download = String(filename || 'article.epub');
        link.hidden = true;

        /* The click has to happen with the link in the document: a detached
           anchor is ignored by Firefox. */
        doc.body.appendChild(link);
        link.click();
        link.remove();

        later(() => urls.revokeObjectURL(objectUrl), this.REVOKE_AFTER_MS);
        return objectUrl;
    }
};

// Expose for classic scripts, ES modules (globalThis), and Node tests (CommonJS)
globalThis.BlobDownload = BlobDownload;
if (typeof module !== 'undefined' && module.exports) {
    module.exports = BlobDownload;
}
