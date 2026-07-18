const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const context = { self: {} };
vm.runInNewContext(fs.readFileSync('src/utils/transfer_utils.js', 'utf8'), context);
const utils = context.self.TransferUtils;

function loadUploader(path, name) {
    const uploaderContext = {
        self: { TransferUtils: utils },
        TransferUtils: utils,
        console: { log() {}, warn() {}, error() {} },
        fetch: async () => { throw new Error('fetch should not run'); }
    };
    vm.runInNewContext(`${fs.readFileSync(path, 'utf8')}; self.__uploader = ${name};`, uploaderContext);
    return uploaderContext.self.__uploader;
}

test('recognizes the supported transfer formats', () => {
    assert.equal(utils.mimeTypeFor('book.epub'), 'application/epub+zip');
    assert.equal(utils.mimeTypeFor('note.TXT'), 'text/plain');
    assert.equal(utils.mimeTypeFor('reader.xtc'), 'application/x-xtc');
    assert.equal(utils.mimeTypeFor('image.png'), null);
});

test('rejects unsafe filenames and directories', () => {
    assert.throws(() => utils.safeFilename('../book.epub'));
    assert.throws(() => utils.safeFilename('book.pdf'));
    assert.throws(() => utils.safeDirectory('send-to-x4/../root'));
    assert.equal(utils.safeDirectory('/send-to-x4/2026-07-17/'), 'send-to-x4/2026-07-17');
});

test('resolves dated destinations and collision names', () => {
    assert.equal(utils.destination('send-to-x4', true, '2026-07-17'), 'send-to-x4/2026-07-17');
    assert.equal(utils.dateFolder('2026-07-17'), '2026-07-17');
    assert.equal(utils.dateFolder('2026-02-30'), null);
    assert.equal(utils.collisionFilename('Article.epub', 1), 'Article (2).epub');
    assert.equal(utils.isConnectivityError('Cannot reach X4. Make sure you are on X4 WiFi.'), true);
    assert.equal(utils.isConnectivityError('Upload failed with status 500'), false);
});

test('Stock and CrossPoint refuse uploads when the destination cannot be created', async () => {
    for (const [path, name] of [['src/upload/x4_upload_tab.js', 'X4UploadTab'], ['src/upload/crosspoint_upload.js', 'CrossPointUpload']]) {
        const uploader = loadUploader(path, name);
        uploader.ensureDirectory = async () => false;
        const result = await uploader.uploadFile({ data: new ArrayBuffer(1), filename: 'book.txt', mimeType: 'text/plain', targetDirectory: 'send-to-x4/2026-07-17' });
        assert.equal(result.success, false);
        assert.match(result.error, /Could not create/);
    }
});

test('Stock collision detection treats every non-directory entry as an existing file', async () => {
    const uploader = loadUploader('src/upload/x4_upload_tab.js', 'X4UploadTab');
    uploader.listDirectory = async () => [{ name: 'book.txt' }, { name: 'folder', type: 'dir' }];
    assert.equal(await uploader.resolveCollision('send-to-x4', 'book.txt'), 'book (2).txt');
});
