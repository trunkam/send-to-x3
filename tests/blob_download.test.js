const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const BlobDownload = require('../src/utils/blob_download.js');

/** A document with just the three calls the module makes on it. */
function fakeEnvironment() {
    const events = [];
    const anchors = [];
    const doc = {
        body: {
            appendChild(node) { events.push(`append:${node.download}`); node.attached = true; }
        },
        createElement(tag) {
            const node = {
                tag,
                attached: false,
                click() { events.push(`click:${node.download}:${node.attached}`); },
                remove() { events.push(`remove:${node.download}`); node.attached = false; }
            };
            anchors.push(node);
            return node;
        }
    };
    const revoked = [];
    const timers = [];
    return {
        events,
        anchors,
        revoked,
        timers,
        environment: {
            document: doc,
            url: {
                createObjectURL: () => 'blob:moz-extension://abc/def',
                revokeObjectURL: (url) => revoked.push(url)
            },
            setTimeout: (fn, delay) => timers.push({ fn, delay })
        }
    };
}

describe('BlobDownload.save', () => {
    it('offers the file under the name it was given', () => {
        const world = fakeEnvironment();
        BlobDownload.save('epub-bytes', 'Title - 2026-09-05.epub', world.environment);

        assert.equal(world.anchors.length, 1);
        assert.equal(world.anchors[0].download, 'Title - 2026-09-05.epub');
        assert.equal(world.anchors[0].href, 'blob:moz-extension://abc/def');
    });

    it('clicks the link while it is in the document, and takes it out after', () => {
        const world = fakeEnvironment();
        BlobDownload.save('epub-bytes', 'Title.epub', world.environment);

        assert.deepEqual(world.events, [
            'append:Title.epub',
            'click:Title.epub:true',
            'remove:Title.epub'
        ]);
    });

    it('names a nameless file rather than saving it as "undefined"', () => {
        const world = fakeEnvironment();
        BlobDownload.save('epub-bytes', null, world.environment);

        assert.equal(world.anchors[0].download, 'article.epub');
    });

    it('lets the object URL outlive the click, then revokes it', () => {
        const world = fakeEnvironment();
        BlobDownload.save('epub-bytes', 'Title.epub', world.environment);

        // Revoking straight away would cancel the download it just started.
        assert.deepEqual(world.revoked, []);
        assert.equal(world.timers.length, 1);
        assert.equal(world.timers[0].delay, BlobDownload.REVOKE_AFTER_MS);

        world.timers[0].fn();
        assert.deepEqual(world.revoked, ['blob:moz-extension://abc/def']);
    });
});
