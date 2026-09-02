const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const DropboxClient = require('../src/utils/dropbox_client.js');

// Real filenames from the shared folder: the iPad Shortcut keeps the page title,
// so typographic apostrophes and commas arrive as they are.
const TYPOGRAPHIC_APOSTROPHE = String.fromCharCode(0x2019);
const REAL_NAME = 'Meta, Nvidia, Intuit, Salesforce, Moderna' + TYPOGRAPHIC_APOSTROPHE + 's Market.html';

// Swaps callApi for a recorder, so the tests exercise the request we build
// without reaching the network.
// Must await the run before restoring: a synchronous finally would put the real
// callApi back while the code under test is still between two awaits, and the
// second request would go to the network.
async function withStubbedApi(responses, run) {
    const original = DropboxClient.callApi;
    const calls = [];
    let index = 0;
    DropboxClient.callApi = async (token, endpoint, body) => {
        calls.push({ token, endpoint, body });
        const response = responses[Math.min(index, responses.length - 1)];
        index++;
        return response;
    };
    try {
        return await run(calls);
    } finally {
        DropboxClient.callApi = original;
    }
}

describe('DropboxClient paths', () => {
    it('accepts a folder written with or without slashes', () => {
        assert.equal(DropboxClient.normalizeFolder('AAA'), '/AAA');
        assert.equal(DropboxClient.normalizeFolder('/AAA'), '/AAA');
        assert.equal(DropboxClient.normalizeFolder('/AAA/'), '/AAA');
        assert.equal(DropboxClient.normalizeFolder('  AAA  '), '/AAA');
    });

    it('treats an empty folder as the Dropbox root, which the API spells ""', () => {
        assert.equal(DropboxClient.normalizeFolder(''), '');
        assert.equal(DropboxClient.normalizeFolder('   '), '');
    });

    it('falls back to a sent folder name rather than writing to the root', () => {
        assert.equal(DropboxClient.normalizeName('inviati'), 'inviati');
        assert.equal(DropboxClient.normalizeName('/inviati/'), 'inviati');
        assert.equal(DropboxClient.normalizeName(''), 'sent');
    });
});

describe('DropboxClient.isSupported', () => {
    it('takes what the pipeline can turn into an article', () => {
        assert.equal(DropboxClient.isSupported('article.html'), true);
        assert.equal(DropboxClient.isSupported('article.htm'), true);
        assert.equal(DropboxClient.isSupported('book.EPUB'), true);
    });

    it('leaves anything else alone', () => {
        assert.equal(DropboxClient.isSupported('scan.pdf'), false);
        assert.equal(DropboxClient.isSupported('notes.txt'), false);
        assert.equal(DropboxClient.isSupported(''), false);
    });
});

describe('DropboxClient.asciiJson', () => {
    // Dropbox-API-Arg is a header, and headers are ASCII: a raw apostrophe here
    // gets the whole request rejected.
    it('escapes everything above plain ASCII', () => {
        const header = DropboxClient.asciiJson({ path: '/AAA/' + REAL_NAME });
        assert.match(header, /^[\x20-\x7e]*$/);
        assert.ok(header.includes('\\u2019'), header);
    });

    it('still parses back to the original name', () => {
        const path = '/AAA/' + REAL_NAME;
        assert.equal(JSON.parse(DropboxClient.asciiJson({ path })).path, path);
    });
});

describe('DropboxClient.list', () => {
    it('keeps convertible files, drops folders and everything else', async () => {
        const entries = [
            { '.tag': 'file', name: 'a.html', path_lower: '/aaa/a.html', size: 10, server_modified: '2026-08-27T10:31:00Z' },
            { '.tag': 'folder', name: 'inviati', path_lower: '/aaa/inviati' },
            { '.tag': 'file', name: 'scan.pdf', path_lower: '/aaa/scan.pdf', size: 20, server_modified: '2026-08-27T10:31:00Z' }
        ];
        await withStubbedApi([{ entries, has_more: false }], async () => {
            const files = await DropboxClient.list('token', 'AAA');
            assert.deepEqual(files.map(file => file.name), ['a.html']);
        });
    });

    it('returns the oldest first, so the queue keeps reading order', async () => {
        const entries = [
            { '.tag': 'file', name: 'new.html', path_lower: '/aaa/new.html', size: 1, client_modified: '2026-08-27T10:00:00Z' },
            { '.tag': 'file', name: 'old.html', path_lower: '/aaa/old.html', size: 1, client_modified: '2026-08-21T10:00:00Z' }
        ];
        await withStubbedApi([{ entries, has_more: false }], async () => {
            const files = await DropboxClient.list('token', 'AAA');
            assert.deepEqual(files.map(file => file.name), ['old.html', 'new.html']);
        });
    });

    it('follows the cursor, or a full folder would lose its oldest articles', async () => {
        const first = {
            entries: [{ '.tag': 'file', name: 'one.html', path_lower: '/aaa/one.html', size: 1, server_modified: '2026-08-01T10:00:00Z' }],
            has_more: true,
            cursor: 'CURSOR'
        };
        const second = {
            entries: [{ '.tag': 'file', name: 'two.html', path_lower: '/aaa/two.html', size: 1, server_modified: '2026-08-02T10:00:00Z' }],
            has_more: false
        };
        await withStubbedApi([first, second], async (calls) => {
            const files = await DropboxClient.list('token', 'AAA');
            assert.deepEqual(files.map(file => file.name), ['one.html', 'two.html']);
            assert.equal(calls[1].endpoint, 'files/list_folder/continue');
            assert.equal(calls[1].body.cursor, 'CURSOR');
        });
    });
});

describe('DropboxClient.moveToSent', () => {
    it('moves into the sub-folder, keeping the name', async () => {
        const file = { name: REAL_NAME, path: '/aaa/' + REAL_NAME.toLowerCase() };
        await withStubbedApi([{}], async (calls) => {
            await DropboxClient.moveToSent('token', file, 'AAA', 'inviati');
            assert.equal(calls[0].endpoint, 'files/move_v2');
            assert.equal(calls[0].body.from_path, file.path);
            assert.equal(calls[0].body.to_path, '/AAA/inviati/' + REAL_NAME);
            // A same-named file already there must not abort the run.
            assert.equal(calls[0].body.autorename, true);
        });
    });
});

describe('DropboxClient.describeError', () => {
    it('says what to do about an expired authorisation', () => {
        assert.match(DropboxClient.describeError(401, 'expired_access_token'), /Re-authorise/);
    });

    it('passes the body through for anything unrecognised', () => {
        assert.match(DropboxClient.describeError(500, 'boom'), /500.*boom/);
    });
});

describe('DropboxClient PKCE', () => {
    it('builds a verifier and a challenge that survive a URL', async () => {
        const verifier = DropboxClient.createVerifier();
        assert.match(verifier, /^[A-Za-z0-9_-]+$/);
        assert.ok(verifier.length >= 43 && verifier.length <= 128, String(verifier.length));

        const challenge = await DropboxClient.challengeFor(verifier);
        assert.match(challenge, /^[A-Za-z0-9_-]+$/);
    });

    it('asks for offline access, without which there is no refresh token', async () => {
        const url = await DropboxClient.authorizeUrl('appkey', DropboxClient.createVerifier());
        assert.ok(url.startsWith(DropboxClient.AUTH_URL + '?'), url);
        assert.match(url, /token_access_type=offline/);
        assert.match(url, /code_challenge_method=S256/);
        assert.match(url, /client_id=appkey/);
        // No redirect_uri on purpose: Dropbox then shows the code to paste.
        assert.ok(!url.includes('redirect_uri'), url);
    });
});
