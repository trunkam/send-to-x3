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
        SETTINGS_PANEL_OPEN: 'settingsPanelOpen',
        ORGANIZE_BY_DATE: 'organizeByDate',
        TARGET_FOLDER: 'targetFolder',

        // Legacy keys for migration
        LEGACY_USE_CROSSPOINT: 'useCrosspointFirmware',
        LEGACY_CROSSPOINT_IP: 'crosspointIp' // This matches the new key, so migration is implicit for CrossPoint
    },

    DEFAULTS: {
        STOCK_IP: '192.168.3.3',
        CROSSPOINT_IP: '192.168.4.1',
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
     * Get Device IP address for the CURRENT firmware type
     * @returns {Promise<string>}
     */
    async getDeviceIp() {
        try {
            const firmwareType = await this.getFirmwareType();
            const keys = [this.KEYS.STOCK_IP, this.KEYS.CROSSPOINT_IP];
            const result = await browserAPI.storage.sync.get(keys);

            if (firmwareType === 'crosspoint') {
                return result[this.KEYS.CROSSPOINT_IP] || this.DEFAULTS.CROSSPOINT_IP;
            } else {
                return result[this.KEYS.STOCK_IP] || this.DEFAULTS.STOCK_IP;
            }
        } catch (error) {
            console.error('[Settings] Error getting IP:', error);
            return this.DEFAULTS.STOCK_IP;
        }
    },

    /**
     * Set Device IP address for the CURRENT firmware type
     * @param {string} ip
     * @returns {Promise<void>}
     */
    async setDeviceIp(ip) {
        try {
            const firmwareType = await this.getFirmwareType();
            const key = firmwareType === 'crosspoint' ? this.KEYS.CROSSPOINT_IP : this.KEYS.STOCK_IP;

            await browserAPI.storage.sync.set({ [key]: ip });
            console.log(`[Settings] IP updated for ${firmwareType}:`, ip);
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
     * @returns {Promise<{firmwareType: string, deviceIp: string, settingsPanelOpen: boolean, organizeByDate: boolean, targetFolder: string}>}
     */
    async getAll() {
        try {
            const firmwareType = await this.getFirmwareType();

            // Get correct IP based on type
            let deviceIp;
            const keys = [this.KEYS.STOCK_IP, this.KEYS.CROSSPOINT_IP];
            const result = await browserAPI.storage.sync.get(keys);
            const panelResult = await browserAPI.storage.sync.get([this.KEYS.SETTINGS_PANEL_OPEN, this.KEYS.ORGANIZE_BY_DATE]);

            if (firmwareType === 'crosspoint') {
                deviceIp = result[this.KEYS.CROSSPOINT_IP] || this.DEFAULTS.CROSSPOINT_IP;
            } else {
                deviceIp = result[this.KEYS.STOCK_IP] || this.DEFAULTS.STOCK_IP;
            }

            const folderResult = await browserAPI.storage.sync.get(this.KEYS.TARGET_FOLDER);

            return {
                firmwareType,
                deviceIp,
                settingsPanelOpen: panelResult[this.KEYS.SETTINGS_PANEL_OPEN] || false,
                organizeByDate: panelResult[this.KEYS.ORGANIZE_BY_DATE] || false,
                targetFolder: this.sanitizeFolderName(folderResult[this.KEYS.TARGET_FOLDER])
            };
        } catch (error) {
            console.error('[Settings] Error getting all settings:', error);
            return {
                firmwareType: 'crosspoint',
                deviceIp: this.DEFAULTS.CROSSPOINT_IP,
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
