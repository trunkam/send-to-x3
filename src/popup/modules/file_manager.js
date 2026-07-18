// Cross-browser compatibility
const browserAPI = typeof browser !== 'undefined' ? browser : chrome;

// TransferUtils is loaded as a classic popup script so the same validation is
// available to the service worker through importScripts.
const MAX_SCANNED_DIRECTORIES = 200;

/**
 * File Manager
 * Handles device communication (X4 standard and CrossPoint firmware)
 */
export class FileManager {
    constructor() {
        this.X4_URL = 'http://192.168.3.3';
        this.X4_EDIT_URL = 'http://192.168.3.3/edit';
        this.X4_LIST_URL = 'http://192.168.3.3/list';
        this.TARGET_FOLDER = 'send-to-x4';
    }

    /**
     * Proxy fetch through background script to avoid CORS/Mixed Content issues
     * @param {string} url 
     * @param {Object} options 
     */
    async bgFetch(url, options = {}) {
        // We cannot pass AbortSignal via message, so we omit it.
        // The background script handles the fetch. We can implement timeout here via race if needed,
        // but for now let's rely on the background script's fetch.
        // Actually, we should strip signal from options if present as it's not clonable.
        const safeOptions = { ...options };
        delete safeOptions.signal;

        const response = await browserAPI.runtime.sendMessage({
            type: 'X4_FETCH',
            payload: {
                url,
                options: safeOptions
            }
        });

        if (!response.success) {
            throw new Error(response.error || 'Fetch failed');
        }

        // Reconstruct a response-like object
        return {
            ok: response.success,
            status: response.status,
            statusText: response.statusText,
            json: async () => response.data, // data is already parsed JSON or text
            text: async () => typeof response.data === 'string' ? response.data : JSON.stringify(response.data)
        };
    }

    /**
     * Check if device is reachable
     * @param {Object} settings - { useCrosspointFirmware, crosspointIp }
     * @returns {Promise<{connected: boolean, files: Array}>}
     */
    async checkDevice(settings) {
        try {
            const isCrosspoint = settings.firmwareType === 'crosspoint';
            const ip = settings.deviceIp;

            // Construct URL based on firmware type
            const baseUrl = `http://${ip}`;

            // CrossPoint uses /api/files, Stock uses /list
            const listUrl = isCrosspoint
                ? `${baseUrl}/api/files`
                : `${baseUrl}/list`;

            const listPath = isCrosspoint ? `${listUrl}?path=/` : `${listUrl}?dir=/`;

            console.log('[File Manager] Checking device:', { type: settings.firmwareType, ip, url: listPath });

            const response = await this.bgFetch(listPath, {
                method: 'GET'
            });

            if (!response.ok) {
                return { connected: false, files: [] };
            }

            const files = await response.json();
            return { connected: true, files };

        } catch (error) {
            console.log('[File Manager] Device not reachable:', error.message);
            return { connected: false, files: [], error: error.message };
        }
    }

    /**
     * Load files from the target folder
     * @param {Object} settings 
     * @param {string} sortOrder 'newest', 'oldest', 'name-asc', 'name-desc'
     * @returns {Promise<Array>}
     */
    async loadFolderFiles(settings, sortOrder = 'newest') {
        this.lastLoadError = null;
        try {
            const isCrosspoint = settings.firmwareType === 'crosspoint';
            const ip = settings.deviceIp;
            const baseUrl = `http://${ip}`;

            const allowed = new Set(['.epub', '.txt', '.xtc']);
            const pending = [this.TARGET_FOLDER];
            const visited = new Set();
            let epubFiles = [];
            while (pending.length) {
                if (visited.size >= MAX_SCANNED_DIRECTORIES) {
                    const error = new Error(`Stopped after scanning ${MAX_SCANNED_DIRECTORIES} folders under ${this.TARGET_FOLDER}.`);
                    error.code = 'SCAN_LIMIT';
                    throw error;
                }
                const folder = pending.shift();
                if (visited.has(folder)) continue;
                visited.add(folder);
                const listUrl = isCrosspoint ? `${baseUrl}/api/files?path=${encodeURIComponent('/' + folder)}` : `${baseUrl}/list?dir=${encodeURIComponent('/' + folder + '/')}`;
                const response = await this.bgFetch(listUrl);
                const files = await response.json();
                if (!Array.isArray(files)) continue;
                for (const file of files) {
                    const isDirectory = isCrosspoint ? file.isDirectory === true || file.type === 'dir' : file.type === 'dir';
                    if (isDirectory) { pending.push(`${folder}/${file.name}`); continue; }
                    const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
                    if (allowed.has(ext)) epubFiles.push({ ...file, folder });
                }
            }

            // Enrich with parsed date for sorting
            epubFiles = epubFiles.map(f => ({
                ...f,
                parsedDate: this.parseDateFromFilename(f.name)
            }));

            // Sort
            epubFiles.sort((a, b) => {
                switch (sortOrder) {
                    case 'newest':
                        return b.parsedDate - a.parsedDate;
                    case 'oldest':
                        return a.parsedDate - b.parsedDate;
                    case 'name-asc':
                        return a.name.localeCompare(b.name);
                    case 'name-desc':
                        return b.name.localeCompare(a.name);
                    default:
                        return 0;
                }
            });

            return epubFiles;
        } catch (error) {
            console.error('[File Manager] Error loading folder:', error);
            if (error.code === 'SCAN_LIMIT') this.lastLoadError = error.message;
            return []; // Return empty on error (folder might not exist)
        }
    }

    /**
     * Parse date from filename format: "Author - YYYY-MM-DD - Title.epub"
     * Returns timestamp (number)
     */
    parseDateFromFilename(filename) {
        try {
            // Match YYYY-MM-DD pattern
            const match = filename.match(/(\d{4}-\d{2}-\d{2})/);
            if (match) {
                return new Date(match[1]).getTime();
            }
            return 0; // No date found, treat as very old
        } catch (e) {
            return 0;
        }
    }

    /**
     * Delete a file from the device
     * @param {string} filename 
     * @param {Object} settings 
     * @returns {Promise<boolean>}
     */
    async deleteFile(file, settings) {
        try {
            const filename = TransferUtils.safeFilename(typeof file === 'string' ? file : file.name);
            const isCrosspoint = settings.firmwareType === 'crosspoint';
            const ip = settings.deviceIp;
            const folder = TransferUtils.safeDirectory(typeof file === 'string' ? this.TARGET_FOLDER : file.folder);
            const fullPath = `/${folder}/${filename}`;

            // Use URLSearchParams instead of FormData for message safety
            const params = new URLSearchParams();
            params.append('path', fullPath);

            let url;
            if (isCrosspoint) {
                // CrossPoint API
                params.append('type', 'file');
                url = `http://${ip}/delete`;
            } else {
                // Standard X4 API
                url = `http://${ip}/edit`;
                // Standard firmware deletes via POST to /edit with delete method?
                // Wait, original code was: method: 'DELETE', body: formData
                // Does standard firmware accept method DELETE? The fetch options said method: 'DELETE'.
                // If so, does it accept body? Yes.
                // We will stick to the same method but change body format.
            }

            const options = {
                method: isCrosspoint ? 'POST' : 'DELETE',
                body: params.toString(),
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            };

            const response = await this.bgFetch(url, options);

            if (response.ok) {
                return true;
            } else {
                throw new Error(`Delete failed: ${response.status}`);
            }

        } catch (error) {
            console.error('[File Manager] Delete error:', error);
            throw error;
        }
    }

    findTargetFolder(files, settings) {
        const isCrosspoint = settings.firmwareType === 'crosspoint';
        if (isCrosspoint) {
            return files.find(f => f.isDirectory && f.name === this.TARGET_FOLDER);
        } else {
            return files.find(f => f.type === 'dir' && f.name === this.TARGET_FOLDER);
        }
    }
}
