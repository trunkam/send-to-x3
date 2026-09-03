const browserAPI = typeof browser !== 'undefined' ? browser : chrome;

/**
 * Settings Manager
 * Handles persistent storage of extension settings
 */
const Settings = {
    KEYS: {
        FIRMWARE_TYPE: 'firmwareType', // 'stock' | 'crosspoint'
        STOCK_IP: 'stockIp',
        CROSSPOINT_IP: 'crosspointIp', // Re-using this key name is fine, but semantically it's now specific
        STOCK_IPS: 'stockIps',
        CROSSPOINT_IPS: 'crosspointIps',
        ACTIVE_IP: 'activeDeviceIp', // last address that actually answered
        SETTINGS_PANEL_OPEN: 'settingsPanelOpen',
        ORGANIZE_BY_DATE: 'organizeByDate',
        TARGET_FOLDER: 'targetFolder',
        // Campaign marker -> the name a reader knows the newsletter by, learned
        // from the first issue that had to be renamed in the queue.
        NEWSLETTER_NAMES: 'newsletterNames',

        // Dropbox: where the iPad Shortcut and the PC drop their files, so the
        // phone can collect them without going through Android's file picker.
        DROPBOX_APP_KEY: 'dropboxAppKey',
        DROPBOX_FOLDER: 'dropboxFolder',
        DROPBOX_SENT_FOLDER: 'dropboxSentFolder',
        DROPBOX_AUTO_SYNC: 'dropboxAutoSync',
        // Kept in storage.local, not sync: it is a credential, and the
        // authorisation is per device anyway.
        DROPBOX_REFRESH_TOKEN: 'dropboxRefreshToken',
        // The PKCE verifier has to outlive the popup: opening the consent page
        // closes the popup on Firefox Android, so by the time the code is pasted
        // back nothing in memory has survived.
        DROPBOX_VERIFIER: 'dropboxVerifier',

        // Legacy keys for migration
        LEGACY_USE_CROSSPOINT: 'useCrosspointFirmware',
        LEGACY_CROSSPOINT_IP: 'crosspointIp' // This matches the new key, so migration is implicit for CrossPoint
    },

    DEFAULTS: {
        STOCK_IP: '192.168.3.3',
        // The X3 joins the phone's hotspot rather than serving its own, so the
        // address comes from the phone's DHCP pool, not CrossPoint's fixed
        // 192.168.4.1. It is stable in practice but can change: the settings
        // panel overrides it.
        CROSSPOINT_IP: '172.16.24.159',
        // Addresses the X3 is known to answer on: the phone hotspot first, the
        // home LAN second. The popup probes them all and keeps whichever
        // replies, so changing network needs no retyping.
        STOCK_IPS: ['192.168.3.3'],
        CROSSPOINT_IPS: ['172.16.24.159', '192.168.1.25'],
        TARGET_FOLDER: 'send-to-x3',
        /* Deliberately empty. The app key is not a secret — with PKCE there is
           nothing else to hide — but it identifies one particular Dropbox app,
           and this repository is public: anyone cloning it has to create their
           own app and paste its key in Settings, not inherit ours. */
        DROPBOX_APP_KEY: '',
        // Named so it sorts first in Dropbox, which is why it exists.
        DROPBOX_FOLDER: 'AAA',
        DROPBOX_SENT_FOLDER: 'inviati',
        DROPBOX_AUTO_SYNC: true
    },

    /**
     * Sanitize a folder name for use on the device filesystem.
     * Delegates to FolderPath (single safe path segment; rejects . / .. and URL-breaking chars).
     * @param {string} name
     * @returns {string}
     */
    sanitizeFolderName(name) {
        if (typeof globalThis.FolderPath !== 'undefined') {
            return globalThis.FolderPath.sanitize(name, this.DEFAULTS.TARGET_FOLDER);
        }
        // Fallback if FolderPath script is missing (should not happen in production)
        if (!name || typeof name !== 'string') {
            return this.DEFAULTS.TARGET_FOLDER;
        }
        const trimmed = name.trim();
        if (!trimmed || trimmed === '.' || trimmed === '..' || /[\/\\]/.test(trimmed)) {
            return this.DEFAULTS.TARGET_FOLDER;
        }
        const cleaned = trimmed
            .replace(/[:*?"<>|#&?%\x00-\x1f]/g, '')
            .replace(/\s+/g, ' ')
            .trim()
            .substring(0, 64);
        if (!cleaned || cleaned === '.' || cleaned === '..') {
            return this.DEFAULTS.TARGET_FOLDER;
        }
        return cleaned;
    },

    /**
     * Get firmware type
     * @returns {Promise<string>} 'stock' or 'crosspoint'
     */
    async getFirmwareType() {
        try {
            const result = await browserAPI.storage.sync.get([
                this.KEYS.FIRMWARE_TYPE,
                this.KEYS.LEGACY_USE_CROSSPOINT
            ]);

            if (result[this.KEYS.FIRMWARE_TYPE]) {
                return result[this.KEYS.FIRMWARE_TYPE];
            }

            // Migration: Check legacy key
            if (result[this.KEYS.LEGACY_USE_CROSSPOINT]) {
                return 'crosspoint';
            }

            return 'crosspoint';
        } catch (error) {
            console.error('[Settings] Error getting firmware type:', error);
            return 'crosspoint';
        }
    },

    /**
     * Set firmware type
     * @param {string} type 'stock' or 'crosspoint'
     * @returns {Promise<void>}
     */
    async setFirmwareType(type) {
        try {
            await browserAPI.storage.sync.set({ [this.KEYS.FIRMWARE_TYPE]: type });
            console.log('[Settings] Firmware type updated:', type);
        } catch (error) {
            console.error('[Settings] Error saving firmware type:', error);
            throw error;
        }
    },

    /**
     * Normalize an address list, with a plain fallback if device_ips.js is
     * somehow not loaded (should not happen in production).
     * @param {unknown} list
     * @returns {string[]}
     */
    normalizeIps(list) {
        if (globalThis.DeviceIps) {
            return globalThis.DeviceIps.normalize(list);
        }
        return (Array.isArray(list) ? list : [])
            .filter(value => typeof value === 'string' && value.trim())
            .map(value => value.trim());
    },

    /**
     * Storage keys and defaults for the CURRENT firmware type.
     * @returns {Promise<{listKey: string, legacyKey: string, defaults: string[], fallback: string}>}
     */
    async ipKeysForFirmware() {
        const isCrosspoint = (await this.getFirmwareType()) === 'crosspoint';
        return {
            listKey: isCrosspoint ? this.KEYS.CROSSPOINT_IPS : this.KEYS.STOCK_IPS,
            legacyKey: isCrosspoint ? this.KEYS.CROSSPOINT_IP : this.KEYS.STOCK_IP,
            defaults: isCrosspoint ? this.DEFAULTS.CROSSPOINT_IPS : this.DEFAULTS.STOCK_IPS,
            fallback: isCrosspoint ? this.DEFAULTS.CROSSPOINT_IP : this.DEFAULTS.STOCK_IP
        };
    },

    /**
     * Known addresses for the CURRENT firmware type.
     * An install that predates the list keeps working: the single address it
     * saved leads the list, followed by the defaults.
     * @returns {Promise<string[]>}
     */
    async getDeviceIps() {
        try {
            const { listKey, legacyKey, defaults } = await this.ipKeysForFirmware();
            const result = await browserAPI.storage.sync.get([listKey, legacyKey]);

            const stored = this.normalizeIps(result[listKey]);
            if (stored.length > 0) {
                return stored;
            }

            return this.normalizeIps([result[legacyKey], ...defaults]);
        } catch (error) {
            console.error('[Settings] Error getting device IPs:', error);
            return this.normalizeIps(this.DEFAULTS.CROSSPOINT_IPS);
        }
    },

    /**
     * Replace the address list for the CURRENT firmware type.
     * Drops the remembered active address if the edit removed it.
     * @param {string[]} list
     * @returns {Promise<string[]>} the list as stored
     */
    async setDeviceIps(list) {
        try {
            const { listKey } = await this.ipKeysForFirmware();
            const ips = this.normalizeIps(list);

            await browserAPI.storage.sync.set({ [listKey]: ips });

            const active = await this.getActiveDeviceIp();
            if (active && !ips.includes(active)) {
                await browserAPI.storage.sync.remove(this.KEYS.ACTIVE_IP);
            }

            console.log('[Settings] Device IPs updated:', ips);
            return ips;
        } catch (error) {
            console.error('[Settings] Error saving device IPs:', error);
            throw error;
        }
    },

    /**
     * Address that answered last time, whatever the firmware type.
     * @returns {Promise<string>} '' when nothing is remembered
     */
    async getActiveDeviceIp() {
        try {
            const result = await browserAPI.storage.sync.get(this.KEYS.ACTIVE_IP);
            return result[this.KEYS.ACTIVE_IP] || '';
        } catch (error) {
            return '';
        }
    },

    /**
     * Remember the address that answered, so it is probed first next time.
     * @param {string} ip
     * @returns {Promise<void>}
     */
    async setActiveDeviceIp(ip) {
        try {
            await browserAPI.storage.sync.set({ [this.KEYS.ACTIVE_IP]: ip });
        } catch (error) {
            console.error('[Settings] Error saving active IP:', error);
        }
    },

    /**
     * The address to talk to right now: the one that answered last time if it
     * is still on the list, otherwise the first entry.
     * @returns {Promise<string>}
     */
    async getDeviceIp() {
        try {
            const { fallback } = await this.ipKeysForFirmware();
            const ips = await this.getDeviceIps();
            const active = await this.getActiveDeviceIp();

            if (active && ips.includes(active)) {
                return active;
            }

            return ips[0] || fallback;
        } catch (error) {
            console.error('[Settings] Error getting IP:', error);
            return this.DEFAULTS.STOCK_IP;
        }
    },

    /**
     * Use this address from now on: added to the list if new, and remembered
     * as the active one.
     * @param {string} ip
     * @returns {Promise<void>}
     */
    async setDeviceIp(ip) {
        try {
            const ips = await this.getDeviceIps();
            const [normalized] = this.normalizeIps([ip]);

            if (!normalized) {
                return;
            }

            if (!ips.includes(normalized)) {
                await this.setDeviceIps([normalized, ...ips]);
            }

            await this.setActiveDeviceIp(normalized);
            console.log('[Settings] Active device IP:', normalized);
        } catch (error) {
            console.error('[Settings] Error saving IP:', error);
            throw error;
        }
    },

    /**
     * Get whether settings panel is open
     * @returns {Promise<boolean>}
     */
    async getSettingsPanelOpen() {
        try {
            const result = await browserAPI.storage.sync.get(this.KEYS.SETTINGS_PANEL_OPEN);
            return result[this.KEYS.SETTINGS_PANEL_OPEN] || false;
        } catch (error) {
            return false;
        }
    },

    /**
     * Set whether settings panel is open
     * @param {boolean} isOpen
     * @returns {Promise<void>}
     */
    async setSettingsPanelOpen(isOpen) {
        try {
            await browserAPI.storage.sync.set({ [this.KEYS.SETTINGS_PANEL_OPEN]: isOpen });
        } catch (error) {
            console.error('[Settings] Error saving panel state:', error);
        }
    },

    async setOrganizeByDate(enabled) {
        await browserAPI.storage.sync.set({ [this.KEYS.ORGANIZE_BY_DATE]: !!enabled });
    },

    /**
     * Newsletter names, as corrected once in the queue and reused from then on.
     * @returns {Promise<Object>} campaign marker -> readable name
     */
    async getNewsletterNames() {
        try {
            const result = await browserAPI.storage.sync.get(this.KEYS.NEWSLETTER_NAMES);
            const stored = result[this.KEYS.NEWSLETTER_NAMES];
            return stored && typeof stored === 'object' ? stored : {};
        } catch (error) {
            console.error('[Settings] Error getting newsletter names:', error);
            return {};
        }
    },

    /**
     * @param {Object} names - campaign marker -> readable name
     * @returns {Promise<void>}
     */
    async setNewsletterNames(names) {
        try {
            await browserAPI.storage.sync.set({ [this.KEYS.NEWSLETTER_NAMES]: names || {} });
        } catch (error) {
            console.error('[Settings] Error saving newsletter names:', error);
            throw error;
        }
    },

    /**
     * Get destination folder name on the device
     * @returns {Promise<string>}
     */
    async getTargetFolder() {
        try {
            const result = await browserAPI.storage.sync.get(this.KEYS.TARGET_FOLDER);
            return this.sanitizeFolderName(result[this.KEYS.TARGET_FOLDER]);
        } catch (error) {
            console.error('[Settings] Error getting target folder:', error);
            return this.DEFAULTS.TARGET_FOLDER;
        }
    },

    /**
     * Set destination folder name on the device
     * @param {string} folderName
     * @returns {Promise<void>}
     */
    async setTargetFolder(folderName) {
        try {
            const sanitized = this.sanitizeFolderName(folderName);
            await browserAPI.storage.sync.set({ [this.KEYS.TARGET_FOLDER]: sanitized });
            console.log('[Settings] Target folder updated:', sanitized);
        } catch (error) {
            console.error('[Settings] Error saving target folder:', error);
            throw error;
        }
    },

    /**
     * Get all settings
     * @returns {Promise<{firmwareType: string, deviceIp: string, deviceIps: string[], settingsPanelOpen: boolean, organizeByDate: boolean, targetFolder: string}>}
     */
    async getAll() {
        try {
            const firmwareType = await this.getFirmwareType();

            const panelResult = await browserAPI.storage.sync.get([this.KEYS.SETTINGS_PANEL_OPEN, this.KEYS.ORGANIZE_BY_DATE]);
            const deviceIps = await this.getDeviceIps();
            const deviceIp = await this.getDeviceIp();

            const folderResult = await browserAPI.storage.sync.get(this.KEYS.TARGET_FOLDER);

            return {
                firmwareType,
                deviceIp,
                deviceIps,
                settingsPanelOpen: panelResult[this.KEYS.SETTINGS_PANEL_OPEN] || false,
                organizeByDate: panelResult[this.KEYS.ORGANIZE_BY_DATE] || false,
                targetFolder: this.sanitizeFolderName(folderResult[this.KEYS.TARGET_FOLDER])
            };
        } catch (error) {
            console.error('[Settings] Error getting all settings:', error);
            return {
                firmwareType: 'crosspoint',
                deviceIp: this.DEFAULTS.CROSSPOINT_IP,
                deviceIps: this.normalizeIps(this.DEFAULTS.CROSSPOINT_IPS),
                settingsPanelOpen: false,
                organizeByDate: false,
                targetFolder: this.DEFAULTS.TARGET_FOLDER
            };
        }
    },

    /**
     * Dropbox configuration. The refresh token lives in storage.local because it
     * is a credential; the rest is ordinary preference and syncs.
     * @returns {Promise<{appKey: string, folder: string, sentFolder: string, refreshToken: string}>}
     */
    async getDropbox() {
        try {
            const preferences = await browserAPI.storage.sync.get([
                this.KEYS.DROPBOX_APP_KEY,
                this.KEYS.DROPBOX_FOLDER,
                this.KEYS.DROPBOX_SENT_FOLDER,
                this.KEYS.DROPBOX_AUTO_SYNC
            ]);
            const secret = await browserAPI.storage.local.get(this.KEYS.DROPBOX_REFRESH_TOKEN);
            const auto = preferences[this.KEYS.DROPBOX_AUTO_SYNC];

            return {
                appKey: preferences[this.KEYS.DROPBOX_APP_KEY] || this.DEFAULTS.DROPBOX_APP_KEY,
                folder: preferences[this.KEYS.DROPBOX_FOLDER] || this.DEFAULTS.DROPBOX_FOLDER,
                sentFolder: preferences[this.KEYS.DROPBOX_SENT_FOLDER] || this.DEFAULTS.DROPBOX_SENT_FOLDER,
                // Default on: the popup is opened in order to send things, so
                // waiting to be asked is the wrong default. Undefined means
                // "never chosen", not "off".
                autoSync: auto === undefined ? this.DEFAULTS.DROPBOX_AUTO_SYNC : Boolean(auto),
                refreshToken: secret[this.KEYS.DROPBOX_REFRESH_TOKEN] || ''
            };
        } catch (error) {
            console.error('[Settings] Error getting Dropbox settings:', error);
            return {
                appKey: this.DEFAULTS.DROPBOX_APP_KEY,
                folder: this.DEFAULTS.DROPBOX_FOLDER,
                sentFolder: this.DEFAULTS.DROPBOX_SENT_FOLDER,
                autoSync: this.DEFAULTS.DROPBOX_AUTO_SYNC,
                refreshToken: ''
            };
        }
    },

    /**
     * Turn the on-open Dropbox check on or off.
     * @param {boolean} enabled
     * @returns {Promise<void>}
     */
    async setDropboxAutoSync(enabled) {
        await browserAPI.storage.sync.set({ [this.KEYS.DROPBOX_AUTO_SYNC]: Boolean(enabled) });
    },

    /**
     * Save the Dropbox folder settings. Only the fields provided are written.
     * @param {{appKey?: string, folder?: string, sentFolder?: string}} values
     * @returns {Promise<void>}
     */
    async setDropboxConfig(values = {}) {
        const payload = {};
        if (typeof values.appKey === 'string') payload[this.KEYS.DROPBOX_APP_KEY] = values.appKey.trim();
        if (typeof values.folder === 'string') payload[this.KEYS.DROPBOX_FOLDER] = values.folder.trim();
        if (typeof values.sentFolder === 'string') payload[this.KEYS.DROPBOX_SENT_FOLDER] = values.sentFolder.trim();
        if (!Object.keys(payload).length) return;

        await browserAPI.storage.sync.set(payload);
    },

    // A verifier older than this belongs to an abandoned attempt: the code that
    // matches it has expired at Dropbox anyway.
    VERIFIER_MAX_AGE_MS: 30 * 60 * 1000,

    /**
     * The PKCE verifier saved when the consent page was opened, if still fresh.
     * @returns {Promise<string>} empty when absent or stale
     */
    async getDropboxVerifier() {
        try {
            const stored = await browserAPI.storage.local.get(this.KEYS.DROPBOX_VERIFIER);
            const entry = stored[this.KEYS.DROPBOX_VERIFIER];
            if (!entry || !entry.value) return '';
            if (Date.now() - (entry.savedAt || 0) > this.VERIFIER_MAX_AGE_MS) {
                await this.setDropboxVerifier('');
                return '';
            }
            return entry.value;
        } catch (error) {
            console.error('[Settings] Error reading Dropbox verifier:', error);
            return '';
        }
    },

    /**
     * Save, or clear, the PKCE verifier. Cleared as soon as it has been spent.
     * @param {string} verifier empty string forgets it
     * @returns {Promise<void>}
     */
    async setDropboxVerifier(verifier) {
        const value = String(verifier || '').trim();
        if (value) {
            await browserAPI.storage.local.set({
                [this.KEYS.DROPBOX_VERIFIER]: { value, savedAt: Date.now() }
            });
        } else {
            await browserAPI.storage.local.remove(this.KEYS.DROPBOX_VERIFIER);
        }
    },

    /**
     * Store, or clear, the Dropbox refresh token.
     * @param {string} token empty string disconnects the account
     * @returns {Promise<void>}
     */
    async setDropboxRefreshToken(token) {
        const value = String(token || '').trim();
        if (value) {
            await browserAPI.storage.local.set({ [this.KEYS.DROPBOX_REFRESH_TOKEN]: value });
        } else {
            await browserAPI.storage.local.remove(this.KEYS.DROPBOX_REFRESH_TOKEN);
        }
    }
};

// Attach to window for global access
// Attach to global scope (window in popup, self in service worker)
if (typeof window !== 'undefined') {
    window.Settings = Settings;
} else {
    self.Settings = Settings;
}
