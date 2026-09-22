const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const KindleOutbox = require('../src/utils/kindle_outbox.js');

const entry = (filename, addedAt, base64 = 'AAAA') => ({ filename, base64, addedAt });

describe('KindleOutbox.add', () => {
    it('keeps one copy per filename, the newest one', () => {
        const first = KindleOutbox.add([], entry('09-22 WSJ.epub', '2026-09-22T10:00:00Z', 'OLD'));
        const again = KindleOutbox.add(first, entry('09-22 WSJ.epub', '2026-09-22T11:00:00Z', 'NEW'));
        assert.equal(again.length, 1);
        assert.equal(again[0].base64, 'NEW');
    });

    it('adds the others after what is already waiting', () => {
        const list = KindleOutbox.add([entry('a.epub', 't1')], entry('b.epub', 't2'));
        assert.deepEqual(list.map(item => item.filename), ['a.epub', 'b.epub']);
    });

    it('stamps a copy that arrives without a time', () => {
        const [added] = KindleOutbox.add([], { filename: 'a.epub', base64: 'AAAA' });
        assert.ok(added.addedAt);
    });
});

describe('KindleOutbox.flush', () => {
    it('sends everything when the network is there', async () => {
        const uploaded = [];
        const result = await KindleOutbox.flush([entry('a.epub', 't1'), entry('b.epub', 't2')], async item => { uploaded.push(item.filename); });
        assert.deepEqual(uploaded, ['a.epub', 'b.epub']);
        assert.equal(result.sent.length, 2);
        assert.equal(result.remaining.length, 0);
        assert.equal(result.error, null);
    });

    it('does not let one refused file hold back the ones after it', async () => {
        const result = await KindleOutbox.flush([entry('bad.epub', 't1'), entry('good.epub', 't2')], async item => {
            if (item.filename === 'bad.epub') throw new Error('Dropbox error 400: malformed path');
        });
        assert.deepEqual(result.sent.map(item => item.filename), ['good.epub']);
        assert.deepEqual(result.remaining.map(item => item.filename), ['bad.epub']);
        assert.match(result.error, /malformed path/);
    });
});

describe('KindleOutbox.settle', () => {
    it('removes what went up', () => {
        const sent = [entry('a.epub', 't1')];
        assert.deepEqual(KindleOutbox.settle([entry('a.epub', 't1'), entry('b.epub', 't2')], sent).map(item => item.filename), ['b.epub']);
    });

    it('keeps a copy added while the upload was running', () => {
        const sent = [entry('a.epub', 't1')];
        const latest = [entry('a.epub', 't1'), entry('c.epub', 't3')];
        assert.deepEqual(KindleOutbox.settle(latest, sent).map(item => item.filename), ['c.epub']);
    });

    it('keeps the same article sent again meanwhile, because it is a newer file', () => {
        const sent = [entry('a.epub', 't1')];
        const latest = [entry('a.epub', 't9', 'NEWER')];
        assert.deepEqual(KindleOutbox.settle(latest, sent), latest);
    });
});

describe('KindleOutbox.describeError', () => {
    it('says "no internet" instead of Firefox\'s fetch error', () => {
        assert.equal(KindleOutbox.describeError('NetworkError when attempting to fetch resource.'), 'no internet connection');
        assert.equal(KindleOutbox.describeError('Failed to fetch'), 'no internet connection');
    });

    it('passes everything else through', () => {
        assert.equal(KindleOutbox.describeError('Dropbox rejected the token. Re-authorise the extension.'), 'Dropbox rejected the token. Re-authorise the extension.');
    });
});

describe('KindleOutbox.toBase64', () => {
    it('round-trips bytes, including a file larger than one slice', () => {
        const bytes = new Uint8Array(100000);
        for (let i = 0; i < bytes.length; i++) bytes[i] = i % 256;
        const back = Buffer.from(KindleOutbox.toBase64(bytes.buffer), 'base64');
        assert.equal(back.length, bytes.length);
        assert.ok(back.equals(Buffer.from(bytes)));
    });
});
