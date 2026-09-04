/* Writes an article straight into a folder on this computer. On the PC that
   folder is the Dropbox one the phone reads from, so the article reaches the
   X3 without an app key: Dropbox's own client does the syncing.

   Why a directory handle and not `downloads`: the downloads API can only write
   inside the browser's download folder and rejects any path that climbs out of
   it, so a folder sitting next to it — Dropbox\AAA beside Dropbox\Download —
   is unreachable. showDirectoryPicker() hands back a handle to any folder, and
   the handle keeps working after it is stored in IndexedDB, so the folder is
   chosen once per computer.

   The handle never leaves the machine: it is not a setting, it is not synced,
   and every install picks its own. The API is Chrome-only; under Firefox this
   module reports itself unsupported and the plain download path stays. */
const SaveFolder = {
    DB_NAME: 'send-to-x3-save-folder',
    STORE: 'handles',
    KEY: 'target',

    isSupported() {
        return typeof globalThis.showDirectoryPicker === 'function';
    },

    // --- The remembered handle ----------------------------------------------

    openDb() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.DB_NAME, 1);
            request.onupgradeneeded = () => request.result.createObjectStore(this.STORE);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error || new Error('Could not open the save-folder store.'));
        });
    },

    async transact(mode, run) {
        const db = await this.openDb();
        try {
            return await new Promise((resolve, reject) => {
                const request = run(db.transaction(this.STORE, mode).objectStore(this.STORE));
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error || new Error('Could not read the saved folder.'));
            });
        } finally {
            db.close();
        }
    },

    async recall() {
        try {
            return (await this.transact('readonly', store => store.get(this.KEY))) || null;
        } catch (error) {
            console.error('[Save Folder] Could not read the stored folder:', error);
            return null;
        }
    },

    remember(handle) {
        return this.transact('readwrite', store => store.put(handle, this.KEY));
    },

    forget() {
        return this.transact('readwrite', store => store.delete(this.KEY));
    },

    /* The picker has to run in a tab: opening it from the toolbar popup closes
       the popup, and the handle would be lost with the page that asked for it. */
    async choose() {
        const handle = await globalThis.showDirectoryPicker({
            id: 'send-to-x3-save-folder',
            mode: 'readwrite',
            startIn: 'downloads'
        });
        await this.remember(handle);
        return handle;
    },

    /* Chrome re-checks folder access, and asking needs a user gesture — which
       is why this is called from a click and never while a page is loading. */
    async permission(handle, { request = false } = {}) {
        if (!handle) return 'denied';
        const options = { mode: 'readwrite' };
        let state = await handle.queryPermission(options);
        if (state !== 'granted' && request) {
            state = await handle.requestPermission(options);
        }
        return state;
    },

    // --- Writing ------------------------------------------------------------

    async write(handle, filename, blob) {
        const name = await this.freeName(handle, filename);
        const file = await handle.getFileHandle(name, { create: true });
        const stream = await file.createWritable();
        try {
            await stream.write(blob);
        } finally {
            await stream.close();
        }
        return name;
    },

    async taken(handle, name) {
        try {
            await handle.getFileHandle(name);
            return true;
        } catch (error) {
            if (error && error.name === 'NotFoundError') return false;
            throw error;
        }
    },

    /* Two articles that end up with the same title must not silently overwrite
       each other. After a stubborn run of collisions the clock breaks the tie,
       so saving never fails just because counting ran out of patience. */
    async freeName(handle, filename) {
        for (let attempt = 1; attempt <= 20; attempt++) {
            const candidate = this.nextName(filename, attempt);
            if (!await this.taken(handle, candidate)) return candidate;
        }
        return this.nextName(filename, Date.now());
    },

    nextName(filename, attempt) {
        const name = String(filename || 'article.epub');
        if (attempt <= 1) return name;
        const dot = name.lastIndexOf('.');
        const stem = dot > 0 ? name.slice(0, dot) : name;
        const extension = dot > 0 ? name.slice(dot) : '';
        return `${stem} (${attempt})${extension}`;
    },

    /* A Blob does not survive a runtime message in Chrome, so the EPUB arrives
       from the service worker as base64 and is rebuilt here. */
    blobFromBase64(base64, type = 'application/epub+zip') {
        const binary = atob(String(base64 || ''));
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        return new Blob([bytes], { type });
    }
};

// Expose for classic scripts, ES modules (globalThis), and Node tests (CommonJS)
globalThis.SaveFolder = SaveFolder;
if (typeof module !== 'undefined' && module.exports) {
    module.exports = SaveFolder;
}
