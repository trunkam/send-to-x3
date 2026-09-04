const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const SaveFolder = require('../src/utils/save_folder.js');

/** A directory handle with just the two calls the module makes on it. */
function fakeFolder(existing = []) {
    const files = new Set(existing);
    const written = [];
    return {
        files,
        written,
        async getFileHandle(name, options = {}) {
            if (!files.has(name)) {
                if (!options.create) {
                    const error = new Error(`no such file: ${name}`);
                    error.name = 'NotFoundError';
                    throw error;
                }
                files.add(name);
            }
            return {
                async createWritable() {
                    return {
                        async write(blob) { written.push({ name, blob }); },
                        async close() { }
                    };
                }
            };
        }
    };
}

describe('SaveFolder.nextName', () => {
    it('leaves the first attempt alone', () => {
        assert.equal(SaveFolder.nextName('Author - 2026-09-04 - Title.epub', 1),
            'Author - 2026-09-04 - Title.epub');
    });

    it('counts before the extension, not after it', () => {
        assert.equal(SaveFolder.nextName('Title.epub', 2), 'Title (2).epub');
        assert.equal(SaveFolder.nextName('A.name.with.dots.epub', 3), 'A.name.with.dots (3).epub');
    });

    it('handles a name with no extension', () => {
        assert.equal(SaveFolder.nextName('Title', 2), 'Title (2)');
    });

    it('falls back to a name rather than nothing', () => {
        assert.equal(SaveFolder.nextName('', 1), 'article.epub');
    });
});

describe('SaveFolder.freeName', () => {
    it('keeps the name when the folder is empty', async () => {
        assert.equal(await SaveFolder.freeName(fakeFolder(), 'Title.epub'), 'Title.epub');
    });

    it('steps past every name already taken', async () => {
        const folder = fakeFolder(['Title.epub', 'Title (2).epub', 'Title (3).epub']);
        assert.equal(await SaveFolder.freeName(folder, 'Title.epub'), 'Title (4).epub');
    });
});

describe('SaveFolder.write', () => {
    it('never overwrites an article already saved', async () => {
        const folder = fakeFolder(['Title.epub']);
        const name = await SaveFolder.write(folder, 'Title.epub', new Blob(['x']));

        assert.equal(name, 'Title (2).epub');
        assert.equal(folder.written.length, 1);
        assert.equal(folder.written[0].name, 'Title (2).epub');
    });
});

describe('SaveFolder.blobFromBase64', () => {
    it('rebuilds the bytes the service worker encoded', async () => {
        const bytes = Uint8Array.from([0x50, 0x4b, 0x03, 0x04, 0xff, 0x00]);
        const blob = SaveFolder.blobFromBase64(Buffer.from(bytes).toString('base64'));

        assert.equal(blob.type, 'application/epub+zip');
        assert.deepEqual(new Uint8Array(await blob.arrayBuffer()), bytes);
    });
});
