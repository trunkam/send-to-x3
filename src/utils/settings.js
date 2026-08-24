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
        TARGET_FOLDER: 'send-to-x3'
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
    }
};

// Attach to window for global access
// Attach to global scope (window in popup, self in service worker)
if (typeof window !== 'undefined') {
    window.Settings = Settings;
} else {
    self.Settings = Settings;
}
