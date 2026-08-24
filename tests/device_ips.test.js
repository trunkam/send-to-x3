const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const DeviceIps = require('../src/utils/device_ips.js');

describe('DeviceIps.normalizeOne', () => {
    it('keeps a bare address', () => {
        assert.equal(DeviceIps.normalizeOne('172.16.24.159'), '172.16.24.159');
        assert.equal(DeviceIps.normalizeOne('  192.168.1.25  '), '192.168.1.25');
    });

    it('accepts a pasted URL and keeps only the host', () => {
        assert.equal(DeviceIps.normalizeOne('http://192.168.1.25/'), '192.168.1.25');
        assert.equal(DeviceIps.normalizeOne('http://192.168.1.25/edit'), '192.168.1.25');
        assert.equal(DeviceIps.normalizeOne('https://x3.local/api/files?path=/'), 'x3.local');
    });

    it('keeps an explicit port', () => {
        assert.equal(DeviceIps.normalizeOne('192.168.1.25:8080'), '192.168.1.25:8080');
    });

    it('rejects what cannot be an address', () => {
        assert.equal(DeviceIps.normalizeOne(''), '');
        assert.equal(DeviceIps.normalizeOne('   '), '');
        assert.equal(DeviceIps.normalizeOne(null), '');
        assert.equal(DeviceIps.normalizeOne(42), '');
        assert.equal(DeviceIps.normalizeOne('two words'), '');
    });

    it('rejects credentials, which would end up in every device URL', () => {
        assert.equal(DeviceIps.normalizeOne('http://user:pass@192.168.1.25'), '');
    });
});

describe('DeviceIps.normalize', () => {
    it('drops blanks and duplicates, keeping the order given', () => {
        assert.deepEqual(
            DeviceIps.normalize(['172.16.24.159', '', 'http://192.168.1.25/', '192.168.1.25', 'two words']),
            ['172.16.24.159', '192.168.1.25']
        );
    });

    it('returns an empty list for anything that is not a list', () => {
        assert.deepEqual(DeviceIps.normalize(null), []);
        assert.deepEqual(DeviceIps.normalize('192.168.1.25'), []);
    });

    it('caps the list', () => {
        const many = Array.from({ length: DeviceIps.MAX + 3 }, (_, i) => `192.168.1.${i + 1}`);
        assert.equal(DeviceIps.normalize(many).length, DeviceIps.MAX);
    });
});

describe('DeviceIps.order', () => {
    it('probes the address that answered last time first', () => {
        assert.deepEqual(
            DeviceIps.order(['172.16.24.159', '192.168.1.25'], '192.168.1.25'),
            ['192.168.1.25', '172.16.24.159']
        );
    });

    it('ignores a preference that is no longer on the list', () => {
        assert.deepEqual(
            DeviceIps.order(['172.16.24.159', '192.168.1.25'], '10.0.0.1'),
            ['172.16.24.159', '192.168.1.25']
        );
    });

    it('normalizes the preference before comparing', () => {
        assert.deepEqual(
            DeviceIps.order(['172.16.24.159', '192.168.1.25'], 'http://192.168.1.25/'),
            ['192.168.1.25', '172.16.24.159']
        );
    });
});

describe('DeviceIps.firstReachable', () => {
    it('returns null when there is nothing to probe', async () => {
        assert.equal(await DeviceIps.firstReachable([], async () => true), null);
        assert.equal(await DeviceIps.firstReachable(null, async () => true), null);
    });

    it('answers without waiting for the addresses we are not on', async () => {
        let releasePending;
        const pending = new Promise(resolve => { releasePending = resolve; });

        const winner = await DeviceIps.firstReachable(
            ['172.16.24.159', '192.168.1.25'],
            ip => (ip === '172.16.24.159' ? Promise.resolve(true) : pending)
        );

        assert.equal(winner, '172.16.24.159');
        releasePending(false);
    });

    it('falls through to a later address when the first does not answer', async () => {
        const winner = await DeviceIps.firstReachable(
            ['172.16.24.159', '192.168.1.25'],
            async ip => ip === '192.168.1.25'
        );

        assert.equal(winner, '192.168.1.25');
    });

    it('returns null when no address answers', async () => {
        const winner = await DeviceIps.firstReachable(
            ['172.16.24.159', '192.168.1.25'],
            async () => false
        );

        assert.equal(winner, null);
    });

    it('treats a probe that throws as no answer', async () => {
        const winner = await DeviceIps.firstReachable(
            ['172.16.24.159', '192.168.1.25'],
            async ip => {
                if (ip === '172.16.24.159') throw new Error('Timeout');
                return true;
            }
        );

        assert.equal(winner, '192.168.1.25');
    });

    it('reports no answer when every probe throws', async () => {
        const winner = await DeviceIps.firstReachable(
            ['172.16.24.159', '192.168.1.25'],
            async () => { throw new Error('Timeout'); }
        );

        assert.equal(winner, null);
    });
});
