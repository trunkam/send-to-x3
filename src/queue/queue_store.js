// TransferUtils is intentionally a popup global: it is also loaded by the
// service worker through importScripts, which keeps validation identical in both contexts.
const DB_NAME = 'send-to-x4-transfer-queue';
const STORE_NAME = 'items';
export const MAX_FILE_BYTES = 50 * 1024 * 1024;
export const MAX_QUEUE_BYTES = 200 * 1024 * 1024;

function openDb() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, 1);
        request.onupgradeneeded = () => {
            const store = request.result.createObjectStore(STORE_NAME, { keyPath: 'id' });
            store.createIndex('createdAt', 'createdAt');
            store.createIndex('sourceUrl', 'sourceUrl', { unique: false });
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error || new Error('Could not open the local transfer queue.'));
    });
}

async function transaction(mode, operation) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, mode);
        const result = operation(tx.objectStore(STORE_NAME));
        tx.oncomplete = () => { db.close(); resolve(result); };
        tx.onerror = () => { db.close(); reject(tx.error || new Error('Could not update the transfer queue.')); };
        tx.onabort = () => { db.close(); reject(tx.error || new Error('Could not update the transfer queue.')); };
    });
}

export async function listQueue() {
    const db = await openDb();
    return new Promise((resolve, reject) => {
        const request = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).getAll();
        request.onsuccess = () => { db.close(); resolve(request.result.sort((a, b) => a.createdAt.localeCompare(b.createdAt))); };
        request.onerror = () => { db.close(); reject(request.error); };
    });
}

export async function queueUsage() {
    return (await listQueue()).reduce((total, item) => total + (item.size || 0), 0);
}

/**
 * The queued name for an article title. Shared with the rename in the queue,
 * so a corrected title produces exactly the name it would have had at import.
 *
 * @param {string} title
 * @returns {string}
 */
export function articleFilename(title) {
    const safe = String(title || 'article').replace(/[\\/:*?"<>|]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120) || 'article';
    return `${safe}.epub`;
}

export async function addArticle(article) {
    const existing = await listQueue();
    if (article.sourceUrl && existing.some(item => item.kind === 'article' && item.sourceUrl === article.sourceUrl)) {
        throw new Error('This article is already in the queue.');
    }
    const filename = articleFilename(article.title);
    const item = makeItem({ kind: 'article', displayName: article.title || 'Untitled article', filename, mimeType: 'application/epub+zip', sourceUrl: article.sourceUrl, article, size: new Blob([JSON.stringify(article)]).size });
    await ensureCapacity(item.size);
    await transaction('readwrite', store => store.put(item));
    return item;
}

export async function addFiles(files) {
    const existing = await listQueue();
    const added = [];
    for (const file of files) {
        const filename = TransferUtils.safeFilename(file.name);
        if (file.size > MAX_FILE_BYTES) throw new Error(`${filename} is larger than the 50 MB per-file limit.`);
        const duplicate = [...existing, ...added].some(item => item.kind === 'file' && item.filename === filename && item.size === file.size);
        if (duplicate) throw new Error(`${filename} is already in the queue.`);
        const item = makeItem({ kind: 'file', displayName: filename, filename, mimeType: TransferUtils.mimeTypeFor(filename), blob: file, size: file.size });
        await ensureCapacity(item.size + added.reduce((total, candidate) => total + candidate.size, 0));
        added.push(item);
    }
    await transaction('readwrite', store => added.forEach(item => store.put(item)));
    return added;
}

function makeItem(values) {
    const now = new Date().toISOString();
    return { schemaVersion: 1, id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`, createdAt: now, contentDate: values.article?.date || now.slice(0, 10), attempts: 0, status: 'queued', lastError: null, ...values };
}

async function ensureCapacity(additionalBytes) {
    if (await queueUsage() + additionalBytes > MAX_QUEUE_BYTES) throw new Error('The transfer queue is full (200 MB maximum). Remove items and try again.');
}

export async function removeItem(id) { await transaction('readwrite', store => store.delete(id)); }
export async function updateItem(item) { await transaction('readwrite', store => store.put(item)); }
export async function recoverInterruptedItems() {
    const items = await listQueue();
    await Promise.all(items.filter(item => item.status === 'sending').map(item => updateItem({ ...item, status: 'queued', lastError: 'Previous transfer was interrupted.' })));
}
