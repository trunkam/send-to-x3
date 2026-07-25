const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const FolderPath = require('../src/utils/folder_path.js');

describe('FolderPath.sanitize', () => {
    it('returns the default for empty or non-string input', () => {
        assert.equal(FolderPath.sanitize(''), FolderPath.DEFAULT);
        assert.equal(FolderPath.sanitize(null), FolderPath.DEFAULT);
        assert.equal(FolderPath.sanitize(undefined), FolderPath.DEFAULT);
        assert.equal(FolderPath.sanitize(42), FolderPath.DEFAULT);
    });

    it('rejects dot segments that would escape the destination', () => {
        assert.equal(FolderPath.sanitize('.'), FolderPath.DEFAULT);
        assert.equal(FolderPath.sanitize('..'), FolderPath.DEFAULT);
        assert.equal(FolderPath.sanitize(' . '), FolderPath.DEFAULT);
        assert.equal(FolderPath.sanitize(' .. '), FolderPath.DEFAULT);
    });

    it('rejects path separators (must be one segment)', () => {
        assert.equal(FolderPath.sanitize('foo/bar'), FolderPath.DEFAULT);
        assert.equal(FolderPath.sanitize('foo\\bar'), FolderPath.DEFAULT);
        assert.equal(FolderPath.sanitize('../escape'), FolderPath.DEFAULT);
        assert.equal(FolderPath.sanitize('/root'), FolderPath.DEFAULT);
    });

    it('strips URL-breaking and illegal filesystem characters', () => {
        assert.equal(FolderPath.sanitize('Books #2026'), 'Books 2026');
        assert.equal(FolderPath.sanitize('Books&More'), 'BooksMore');
        assert.equal(FolderPath.sanitize('a?b'), 'ab');
        assert.equal(FolderPath.sanitize('a:b*c?"<>|'), 'abc');
    });

    it('preserves safe folder names', () => {
        assert.equal(FolderPath.sanitize('send-to-x4'), 'send-to-x4');
        assert.equal(FolderPath.sanitize('My Books'), 'My Books');
        assert.equal(FolderPath.sanitize('Articles_2026'), 'Articles_2026');
        assert.equal(FolderPath.sanitize('.hidden-ok'), '.hidden-ok');
    });

    it('falls back when cleaning removes everything', () => {
        assert.equal(FolderPath.sanitize('###'), FolderPath.DEFAULT);
        assert.equal(FolderPath.sanitize('&&&'), FolderPath.DEFAULT);
    });

    it('truncates to 64 characters', () => {
        const long = 'a'.repeat(80);
        assert.equal(FolderPath.sanitize(long).length, 64);
    });
});

describe('FolderPath path builders', () => {
    it('builds dir and file paths under a single sanitized segment', () => {
        assert.equal(FolderPath.dirPath('send-to-x4'), '/send-to-x4');
        assert.equal(FolderPath.dirPath('send-to-x4', { trailingSlash: true }), '/send-to-x4/');
        assert.equal(FolderPath.filePath('send-to-x4', 'file.epub'), '/send-to-x4/file.epub');
    });

    it('never produces traversal paths for ..', () => {
        assert.equal(FolderPath.filePath('..', 'file.epub'), `/${FolderPath.DEFAULT}/file.epub`);
        assert.equal(FolderPath.dirPath('..'), `/${FolderPath.DEFAULT}`);
        assert.notEqual(FolderPath.filePath('..', 'file.epub'), '/../file.epub');
    });
});

describe('upload / list / delete path consistency (both firmwares)', () => {
    const ip = '192.168.3.3';
    const filename = 'Author - 2026-07-21 - Title.epub';

    const cases = [
        { label: 'default folder', folder: 'send-to-x4', expected: 'send-to-x4' },
        { label: 'name with hash', folder: 'Books #2026', expected: 'Books 2026' },
        { label: 'name with ampersand', folder: 'Books&More', expected: 'BooksMore' },
        { label: 'dot segment', folder: '..', expected: FolderPath.DEFAULT },
        { label: 'nested path attempt', folder: 'a/b', expected: FolderPath.DEFAULT }
    ];

    for (const { label, folder, expected } of cases) {
        it(`stock firmware: list/upload/delete agree for ${label}`, () => {
            const safe = FolderPath.sanitize(folder);
            assert.equal(safe, expected);

            const list = FolderPath.listUrl(ip, 'stock', folder);
            const uploadPath = FolderPath.filePath(folder, filename);
            const deletePath = FolderPath.filePath(folder, filename);

            const listUrl = new URL(list);
            assert.equal(listUrl.pathname, '/list');
            assert.equal(listUrl.searchParams.get('dir'), `/${expected}/`);
            // Fragment must not capture part of the folder name
            assert.equal(listUrl.hash, '');
            assert.equal(uploadPath, `/${expected}/${filename}`);
            assert.equal(deletePath, uploadPath);
            assert.equal(deletePath, `/${safe}/${filename}`);
        });

        it(`crosspoint firmware: list/upload/delete agree for ${label}`, () => {
            const safe = FolderPath.sanitize(folder);
            assert.equal(safe, expected);

            const list = FolderPath.listUrl(ip, 'crosspoint', folder);
            const uploadDir = FolderPath.dirPath(folder);
            const uploadUrl = FolderPath.crosspointUploadUrl(ip, folder, true);
            const deletePath = FolderPath.filePath(folder, filename);

            const listUrl = new URL(list);
            assert.equal(listUrl.pathname, '/api/files');
            assert.equal(listUrl.searchParams.get('path'), `/${expected}`);
            assert.equal(listUrl.hash, '');

            const upload = new URL(uploadUrl);
            assert.equal(upload.pathname, '/upload');
            assert.equal(upload.searchParams.get('path'), `/${expected}`);
            assert.equal(upload.hash, '');

            assert.equal(uploadDir, `/${expected}`);
            assert.equal(deletePath, `/${expected}/${filename}`);
            // List dir and upload dir must match
            assert.equal(listUrl.searchParams.get('path'), upload.searchParams.get('path'));
        });
    }

    it('encodes spaces in list query values without treating # as a fragment', () => {
        const url = new URL(FolderPath.listUrl(ip, 'stock', 'Books #2026'));
        assert.equal(url.hash, '');
        assert.equal(url.searchParams.get('dir'), '/Books 2026/');
        assert.match(url.search, /Books(\+|%20)2026/);
    });
});
