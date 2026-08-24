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
    /**
     * One reachability probe waits this long. On the local network the device
     * answers in about 5 ms; an address we are not on never answers at all, so
     * this is only ever the cost of being disconnected.
     */
    static PROBE_TIMEOUT_MS = 2500;

    constructor() {
        this.lastLoadError = null;
    }

    getTargetFolder(settings) {
        const raw = settings?.targetFolder || 'send-to-x3';
        const api = globalThis.FolderPath || globalThis.Settings;
        if (api?.sanitize) {
            return api.sanitize(raw);
        }
        if (api?.sanitizeFolderName) {
            return api.sanitizeFolderName(raw);
        }
        return raw;
    }

    /**
     * Proxy fetch through background script to avoid CORS/Mixed Content issues
     * @param {string} url 
     * @param {Object} options 
     */
    async bgFetch(url, options = {}, timeoutMs) {
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
                options: safeOptions,
                timeoutMs
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
     * Addresses to try, best guess first.
     * @param {Object} settings
     * @returns {string[]}
     */
    candidateIps(settings) {
        const list = Array.isArray(settings.deviceIps) && settings.deviceIps.length > 0
            ? settings.deviceIps
            : [settings.deviceIp];

        if (globalThis.DeviceIps) {
            return globalThis.DeviceIps.order(list, settings.deviceIp);
        }

        return list.filter(Boolean);
    }

    /**
     * Root listing URL, used both as the connectivity probe and as the first
     * directory read.
     * @param {string} ip
     * @param {Object} settings
     * @returns {string}
     */
    rootListUrl(ip, settings) {
        const isCrosspoint = settings.firmwareType === 'crosspoint';
        const firmwareType = isCrosspoint ? 'crosspoint' : 'stock';

        if (globalThis.FolderPath) {
            return globalThis.FolderPath.rootListUrl(ip, firmwareType);
        }

        return isCrosspoint
            ? `http://${ip}/api/files?path=/`
            : `http://${ip}/list?dir=/`;
    }

    /**
     * Check whether the device answers, trying every known address at once.
     *
     * The X3 has a different address on the phone hotspot than on the home
     * LAN. Probing them in parallel and keeping whichever replies means the
     * address never has to be retyped; a hit settles as fast as a single
     * check, because the addresses we are not on simply never answer.
     *
     * @param {Object} settings - { firmwareType, deviceIp, deviceIps }
     * @returns {Promise<{connected: boolean, files: Array, ip: string|null, error?: string}>}
     */
    async checkDevice(settings) {
        const candidates = this.candidateIps(settings);

        if (candidates.length === 0) {
            return { connected: false, files: [], ip: null };
        }

        console.log('[File Manager] Checking device:', { type: settings.firmwareType, candidates });

        const listings = new Map();
        let lastError = null;

        const probe = async (ip) => {
            try {
                const response = await this.bgFetch(
                    this.rootListUrl(ip, settings),
                    { method: 'GET' },
                    FileManager.PROBE_TIMEOUT_MS
                );

                if (!response.ok) {
                    return false;
                }

                listings.set(ip, await response.json());
                return true;
            } catch (error) {
                lastError = error.message;
                console.log('[File Manager] No answer from', ip + ':', error.message);
                return false;
            }
        };

        const reachable = globalThis.DeviceIps
            ? await globalThis.DeviceIps.firstReachable(candidates, probe)
            : (await probe(candidates[0]) ? candidates[0] : null);

        if (!reachable) {
            return { connected: false, files: [], ip: null, error: lastError || undefined };
        }

        console.log('[File Manager] Device answered at', reachable);
        return { connected: true, files: listings.get(reachable) || [], ip: reachable };
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
            const targetFolder = this.getTargetFolder(settings);
            const allowed = new Set(['.epub', '.txt', '.xtc']);
            const pending = [targetFolder];
            const visited = new Set();
            let epubFiles = [];
            while (pending.length) {
                if (visited.size >= MAX_SCANNED_DIRECTORIES) {
                    const error = new Error(`Stopped after scanning ${MAX_SCANNED_DIRECTORIES} folders under ${targetFolder}.`);
                    error.code = 'SCAN_LIMIT';
                    throw error;
                }
                const folder = pending.shift();
                if (visited.has(folder)) continue;
                visited.add(folder);
                const listUrl = new URL(isCrosspoint ? `http://${ip}/api/files` : `http://${ip}/list`);
                listUrl.searchParams.set(isCrosspoint ? 'path' : 'dir', isCrosspoint ? `/${folder}` : `/${folder}/`);
                const response = await this.bgFetch(listUrl.toString());
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
            const targetFolder = this.getTargetFolder(settings);
            const folder = TransferUtils.safeDirectory(typeof file === 'string' ? targetFolder : file.folder);
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
        const targetFolder = this.getTargetFolder(settings);
        const isCrosspoint = settings.firmwareType === 'crosspoint';
        if (isCrosspoint) {
            return files.find(f => f.isDirectory && f.name === targetFolder);
        } else {
            return files.find(f => f.type === 'dir' && f.name === targetFolder);
        }
    }
}
