/**
 * CrossPoint Firmware Upload API
 * Uses the CrossPoint firmware endpoints (http://192.168.4.1)
 *
 * API endpoints:
 * - POST /upload - Upload file via multipart form data
 * - GET /api/files?path=/ - List directory contents
 * - POST /mkdir - Create folder
 * - POST /delete - Delete file or folder
 */
const CrossPointUpload = {
    // CROSSPOINT_URL: 'http://192.168.4.1',
    // UPLOAD_ENDPOINT: 'http://192.168.4.1/upload',
    // LIST_ENDPOINT: 'http://192.168.4.1/api/files',
    // MKDIR_ENDPOINT: 'http://192.168.4.1/mkdir',
    // DELETE_ENDPOINT: 'http://192.168.4.1/delete',
    // Default IP
    ip: '192.168.4.1',

    setIp(ip) {
        this.ip = ip || '192.168.4.1';
    },

    get uploadEndpoint() { return `http://${this.ip}/upload`; },
    get listEndpoint() { return `http://${this.ip}/api/files`; },
    get mkdirEndpoint() { return `http://${this.ip}/mkdir`; },
    get deleteEndpoint() { return `http://${this.ip}/delete`; },
    DEFAULT_TARGET_FOLDER: 'send-to-x4',

    /**
     * Upload EPUB to CrossPoint device
     * Files are placed in the configured destination folder for organization
     * @param {ArrayBuffer} epubData - The EPUB file as ArrayBuffer
     * @param {string} filename - The filename to use
     * @param {string} [targetFolder] - Destination folder name on the device
     * @returns {Promise<{success: boolean, error?: string}>}
     */
    async uploadEpub(epubData, filename, targetFolder) {
        const folder = targetFolder || this.DEFAULT_TARGET_FOLDER;
        console.log('[CrossPoint Upload] Starting upload for:', filename);
        console.log('[CrossPoint Upload] File size:', epubData.byteLength, 'bytes');

        try {
            // Step 1: Ensure target folder exists
            const folderReady = await this.ensureFolderExists(folder);
            if (!folderReady) {
                console.warn('[CrossPoint Upload] Could not verify/create folder, uploading to root instead');
            }

            // Step 2: Determine upload path
            const uploadPath = folderReady ? `/${folder}` : `/`;

            console.log('[CrossPoint Upload] Upload path:', uploadPath);

            // Step 3: Upload the file
            return await this.uploadFile(epubData, filename, uploadPath);

        } catch (error) {
            console.error('[CrossPoint Upload] Error:', error);
            return { success: false, error: error.message };
        }
    },

    /**
     * Check if folder exists and create if not
     * @param {string} folderName - Folder name (without slashes)
     * @returns {Promise<boolean>} - True if folder exists or was created
     */
    async ensureFolderExists(folderName) {
        try {
            // Check if folder exists
            console.log('[CrossPoint Upload] Checking if folder exists:', folderName);
            const exists = await this.folderExists(folderName);

            if (exists) {
                console.log('[CrossPoint Upload] Folder already exists');
                return true;
            }

            // Create folder
            console.log('[CrossPoint Upload] Creating folder:', folderName);
            return await this.createFolder(folderName);

        } catch (error) {
            console.error('[CrossPoint Upload] Error checking/creating folder:', error);
            return false; // Continue with root upload
        }
    },

    async folderExists(folderName) {
        try {
            const response = await fetch(`${this.listEndpoint}?path=/`, {
                method: 'GET'
            });

            if (!response.ok) {
                console.log('[CrossPoint Upload] List request failed:', response.status);
                return false;
            }

            const items = await response.json();
            console.log('[CrossPoint Upload] Root directory contents:', items);

            // Check if our folder exists (isDirectory: true)
            const folder = items.find(item =>
                item.isDirectory && item.name === folderName
            );

            return !!folder;

        } catch (error) {
            console.error('[CrossPoint Upload] Error listing directory:', error);
            return false;
        }
    },

    /**
     * Create a folder using POST /mkdir
     * @param {string} folderName
     * @returns {Promise<boolean>}
     */
    async createFolder(folderName) {
        try {
            const formData = new FormData();
            formData.append('name', folderName);
            formData.append('path', '/');

            const response = await fetch(this.mkdirEndpoint, {
                method: 'POST',
                body: formData
            });

            console.log('[CrossPoint Upload] Create folder response:', response.status);

            if (response.ok) {
                console.log('[CrossPoint Upload] Folder created successfully');
                return true;
            } else {
                const text = await response.text();
                console.error('[CrossPoint Upload] Failed to create folder:', text);
                return false;
            }

        } catch (error) {
            console.error('[CrossPoint Upload] Error creating folder:', error);
            return false;
        }
    },

    /**
     * Upload file to specified path
     * @param {ArrayBuffer} data
     * @param {string} filename - Just the filename (e.g., "file.epub")
     * @param {string} path - Directory path (e.g., "/send-to-x4")
     * @returns {Promise<{success: boolean, error?: string}>}
     */
    async uploadFile(data, filename, path) {
        try {
            const blob = new Blob([data], { type: 'application/epub+zip' });
            const formData = new FormData();

            // Create file with just the filename
            const file = new File([blob], filename, { type: 'application/epub+zip' });
            formData.append('file', file);

            // Add query parameter for path
            const uploadUrl = `${this.uploadEndpoint}?path=${encodeURIComponent(path)}`;

            // Create timeout controller (30s)
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 30000);

            console.log('[CrossPoint Upload] Sending POST with 30s timeout...');

            try {
                const response = await fetch(uploadUrl, {
                    method: 'POST',
                    body: formData,
                    signal: controller.signal
                });
                clearTimeout(timeoutId);

                console.log('[CrossPoint Upload] Response status:', response.status);

                if (response.ok) {
                    const responseText = await response.text();
                    console.log('[CrossPoint Upload] Success! Response:', responseText);
                    return { success: true };
                } else {
                    const errorText = await response.text();
                    console.error('[CrossPoint Upload] Error response:', errorText);
                    return {
                        success: false,
                        error: `Upload failed with status ${response.status}`
                    };
                }
            } catch (error) {
                clearTimeout(timeoutId);
                throw error;
            }

        } catch (error) {
            console.error('[CrossPoint Upload] Fetch error:', error);

            if (error.name === 'TypeError' && error.message.includes('Failed to fetch')) {
                return {
                    success: false,
                    error: 'Cannot reach CrossPoint device. Make sure you are on CrossPoint WiFi.'
                };
            }

            return { success: false, error: error.message };
        }
    }
};
