/* The copies waiting to reach the Kindle's folder on Dropbox.

   The X3 stays the main reader, but the Kindle does not wait for it: an
   article is copied the moment it enters the extension - sent, queued or
   imported - so an article queued while the X3 is away is on the Kindle all
   the same. Dropbox needs internet, and the phone does not always have it: in
   the underground the X3 still answers on the hotspot, Dropbox does not. So a
   copy is written down here before it is attempted, and whatever did not go
   through is tried again the next time the popup opens.

   The bytes are kept, not the article, so the copy does not have to be rebuilt
   from an article that may have left the queue by then. This module holds no storage and no network - both come in
   as arguments - so it stays testable under Node. */
const KindleOutbox = {
    /* One entry per filename. An article sent again replaces its waiting copy
       instead of queueing a second one that would overwrite the first anyway. */
    add(pending, entry) {
        const others = (pending || []).filter(candidate => candidate.filename !== entry.filename);
        return [...others, { filename: entry.filename, base64: entry.base64, addedAt: entry.addedAt || new Date().toISOString() }];
    },

    /* Tries every entry, not only up to the first failure: a name Dropbox
       rejects must not hold back the others behind it. Returns what went
       through and what is left, and the last reason something did not. */
    async flush(pending, upload) {
        const sent = [];
        const remaining = [];
        let error = null;
        for (const entry of pending || []) {
            try {
                await upload(entry);
                sent.push(entry);
            } catch (failure) {
                remaining.push(entry);
                error = failure.message || String(failure);
            }
        }
        return { sent, remaining, error };
    },

    /* What is left once the uploaded entries are taken out of the list as it
       stands now, which may have grown while the upload ran. An entry is gone
       only if it is the very copy that went up: the same article sent again in
       the meantime has a newer addedAt, and still has to go. */
    settle(latest, sent) {
        return (latest || []).filter(entry =>
            !sent.some(done => done.filename === entry.filename && done.addedAt === entry.addedAt));
    },

    // Firefox reports a missing network as a bare TypeError from fetch, which
    // says nothing to someone reading it on a phone in a tunnel.
    describeError(message) {
        const text = String(message || '');
        if (/NetworkError|Failed to fetch|Load failed|network/i.test(text)) return 'no internet connection';
        return text;
    },

    // In slices: spreading a whole EPUB into fromCharCode overflows the stack.
    toBase64(bytes) {
        const view = new Uint8Array(bytes);
        let binary = '';
        for (let start = 0; start < view.length; start += 0x8000) {
            binary += String.fromCharCode(...view.subarray(start, start + 0x8000));
        }
        return btoa(binary);
    }
};

// Expose for classic scripts, ES modules (globalThis), and Node tests (CommonJS)
globalThis.KindleOutbox = KindleOutbox;
if (typeof module !== 'undefined' && module.exports) {
    module.exports = KindleOutbox;
}
