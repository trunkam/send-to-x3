/**
 * Known device addresses.
 *
 * The X3 has more than one address in practice: one on the phone's hotspot
 * (assigned by the phone's DHCP) and one on the home LAN. Rather than making
 * the user retype the address every time the network changes, we keep a list
 * and probe the entries in parallel when the popup opens — whichever answers
 * is the one we are on. The entry that answered is remembered and tried first
 * next time, so the common case resolves on the first probe.
 */
const DeviceIps = {
    /** Upper bound on stored addresses; the panel is a phone-width popup. */
    MAX: 6,

    /**
     * Reduce user input to a bare host (optionally host:port).
     * Accepts a pasted URL ("http://192.168.1.25/edit") and keeps only the part
     * we build device URLs from. Returns '' when nothing usable is left.
     * @param {unknown} value
     * @returns {string}
     */
    normalizeOne(value) {
        if (typeof value !== 'string') {
            return '';
        }

        const trimmed = value.trim();
        if (!trimmed) {
            return '';
        }

        const withScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(trimmed) ? trimmed : `http://${trimmed}`;

        let url;
        try {
            url = new URL(withScheme);
        } catch (error) {
            return '';
        }

        // Credentials in an address would end up in every device URL we build
        if (!url.hostname || url.username || url.password) {
            return '';
        }

        return url.port ? `${url.hostname}:${url.port}` : url.hostname;
    },

    /**
     * Normalize a stored or edited list: drop the unusable, drop duplicates,
     * keep the order the user put them in, cap the length.
     * @param {unknown} list
     * @returns {string[]}
     */
    normalize(list) {
        const source = Array.isArray(list) ? list : [];
        const result = [];

        for (const raw of source) {
            const ip = this.normalizeOne(raw);
            if (ip && !result.includes(ip)) {
                result.push(ip);
            }
            if (result.length >= this.MAX) {
                break;
            }
        }

        return result;
    },

    /**
     * Probe order: the address that answered last time goes first, so a hit
     * usually settles before the other candidates have timed out.
     * @param {unknown} list
     * @param {unknown} preferred
     * @returns {string[]}
     */
    order(list, preferred) {
        const ips = this.normalize(list);
        const first = this.normalizeOne(preferred);

        if (first && ips.includes(first)) {
            return [first, ...ips.filter(ip => ip !== first)];
        }

        return ips;
    },

    /**
     * Probe every candidate at once and resolve as soon as one answers.
     * Waiting for all of them would cost a full timeout on every popup open,
     * since the addresses we are not on never answer.
     * @param {string[]} candidates
     * @param {(ip: string) => Promise<boolean>} probe
     * @returns {Promise<string|null>} the address that answered, or null
     */
    firstReachable(candidates, probe) {
        const ips = Array.isArray(candidates) ? candidates : [];

        if (ips.length === 0) {
            return Promise.resolve(null);
        }

        return new Promise(resolve => {
            let pending = ips.length;
            let settled = false;

            const fail = () => {
                pending -= 1;
                if (!settled && pending === 0) {
                    settled = true;
                    resolve(null);
                }
            };

            for (const ip of ips) {
                Promise.resolve()
                    .then(() => probe(ip))
                    .then(reachable => {
                        if (settled) {
                            return;
                        }
                        if (reachable) {
                            settled = true;
                            resolve(ip);
                            return;
                        }
                        fail();
                    })
                    .catch(fail);
            }
        });
    }
};

// Expose for classic scripts, ES modules (globalThis), and Node tests (CommonJS)
globalThis.DeviceIps = DeviceIps;
if (typeof module !== 'undefined' && module.exports) {
    module.exports = DeviceIps;
}
