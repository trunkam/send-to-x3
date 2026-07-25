/**
 * Safe destination-folder helpers shared by popup, service worker, and uploaders.
 * Enforces a single path segment and builds device URLs without string concatenation.
 */
const FolderPath = {
    DEFAULT: 'send-to-x4',

    /**
     * Sanitize a folder name to a single safe path segment.
     * Rejects empty values, path separators, and dot segments (. / ..).
     * Strips characters that break query strings or are illegal on common filesystems.
     * @param {string} name
     * @param {string} [defaultFolder]
     * @returns {string}
     */
    sanitize(name, defaultFolder = FolderPath.DEFAULT) {
        if (!name || typeof name !== 'string') {
            return defaultFolder;
        }

        const trimmed = name.trim();

        // One path segment only — reject separators and dot segments before cleaning
        if (!trimmed || trimmed === '.' || trimmed === '..' || /[\/\\]/.test(trimmed)) {
            return defaultFolder;
        }

        const cleaned = trimmed
            .replace(/[:*?"<>|#&?%\x00-\x1f]/g, '')
            .replace(/\s+/g, ' ')
            .trim()
            .substring(0, 64);

        if (!cleaned || cleaned === '.' || cleaned === '..') {
            return defaultFolder;
        }

        return cleaned;
    },

    /**
     * Device directory path for the target folder (e.g. /send-to-x4).
     * @param {string} folder
     * @param {{ trailingSlash?: boolean }} [options]
     * @returns {string}
     */
    dirPath(folder, options = {}) {
        const safe = this.sanitize(folder);
        return options.trailingSlash ? `/${safe}/` : `/${safe}`;
    },

    /**
     * Full device file path (e.g. /send-to-x4/file.epub).
     * @param {string} folder
     * @param {string} filename
     * @returns {string}
     */
    filePath(folder, filename) {
        return `${this.dirPath(folder)}/${filename}`;
    },

    /**
     * List-directory URL for stock or CrossPoint firmware.
     * Uses URLSearchParams so #, &, spaces, etc. cannot break the query string.
     * @param {string} ip
     * @param {'stock'|'crosspoint'} firmwareType
     * @param {string} folder
     * @returns {string}
     */
    listUrl(ip, firmwareType, folder) {
        if (firmwareType === 'crosspoint') {
            const url = new URL(`http://${ip}/api/files`);
            url.searchParams.set('path', this.dirPath(folder));
            return url.toString();
        }

        const url = new URL(`http://${ip}/list`);
        url.searchParams.set('dir', this.dirPath(folder, { trailingSlash: true }));
        return url.toString();
    },

    /**
     * Root listing URL (device connectivity check).
     * @param {string} ip
     * @param {'stock'|'crosspoint'} firmwareType
     * @returns {string}
     */
    rootListUrl(ip, firmwareType) {
        if (firmwareType === 'crosspoint') {
            const url = new URL(`http://${ip}/api/files`);
            url.searchParams.set('path', '/');
            return url.toString();
        }

        const url = new URL(`http://${ip}/list`);
        url.searchParams.set('dir', '/');
        return url.toString();
    },

    /**
     * CrossPoint upload URL with encoded destination directory.
     * @param {string} ip
     * @param {string} folder - folder name; sanitized to /folder (or / if empty/default misuse)
     * @param {boolean} [folderReady=true]
     * @returns {string}
     */
    crosspointUploadUrl(ip, folder, folderReady = true) {
        const url = new URL(`http://${ip}/upload`);
        const path = folderReady ? this.dirPath(folder) : '/';
        url.searchParams.set('path', path);
        return url.toString();
    }
};

// Expose for classic scripts, ES modules (globalThis), and Node tests (CommonJS)
globalThis.FolderPath = FolderPath;
if (typeof module !== 'undefined' && module.exports) {
    module.exports = FolderPath;
}
