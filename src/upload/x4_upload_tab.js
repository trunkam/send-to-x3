/**
 * X4 Upload via Direct HTTP POST
 * Uses the X4's /edit endpoint directly
 * 
 * API endpoints discovered:
 * - GET /list?dir=/ - List directory contents
 * - PUT /edit with name="path" - Create folder
 * - POST /edit with name="data" - Upload file
 */
const X4UploadTab = {
    // Default IP
    ip: '192.168.3.3',

    setIp(ip) {
        this.ip = ip || '192.168.3.3';
    },

    get UPLOAD_ENDPOINT() { return `http://${this.ip}/edit`; },
    get LIST_ENDPOINT() { return `http://${this.ip}/list`; },
    DEFAULT_TARGET_FOLDER: 'send-to-x4',

    /**
     * Upload EPUB to X4 via direct HTTP POST
     * Files are placed in the configured destination folder for organization
     * @param {ArrayBuffer} epubData - The EPUB file as ArrayBuffer
     * @param {string} filename - The filename to use
     * @param {string} [targetFolder] - Destination folder name on the device
     * @returns {Promise<{success: boolean, error?: string}>}
     */
    async uploadEpub(epubData, filename, targetFolder) {
        const folder = targetFolder || this.DEFAULT_TARGET_FOLDER;
        console.log('[X4 Upload] Starting upload for:', filename);
        console.log('[X4 Upload] File size:', epubData.byteLength, 'bytes');

        try {
            // Step 1: Ensure target folder exists
            const folderReady = await this.ensureFolderExists(folder);
            if (!folderReady) {
                console.warn('[X4 Upload] Could not verify/create folder, uploading to root instead');
            }

            // Step 2: Determine upload path
            const uploadPath = folderReady
                ? `/${folder}/${filename}`
                : `/${filename}`;

            console.log('[X4 Upload] Upload path:', uploadPath);

            // Step 3: Upload the file
            return await this.uploadFile(epubData, uploadPath);

        } catch (error) {
            console.error('[X4 Upload] Error:', error);
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
            console.log('[X4 Upload] Checking if folder exists:', folderName);
            const exists = await this.folderExists(folderName);

            if (exists) {
                console.log('[X4 Upload] Folder already exists');
                return true;
            }

            // Create folder
            console.log('[X4 Upload] Creating folder:', folderName);
            return await this.createFolder(folderName);

        } catch (error) {
            console.error('[X4 Upload] Error checking/creating folder:', error);
            return false; // Continue with root upload
        }
    },

    /**
     * Check if folder exists using /list endpoint
     * @param {string} folderName 
     * @returns {Promise<boolean>}
     */
    async folderExists(folderName) {
        try {
            const response = await fetch(`${this.LIST_ENDPOINT}?dir=/`, {
                method: 'GET'
            });

            if (!response.ok) {
                console.log('[X4 Upload] List request failed:', response.status);
                return false;
            }

            const items = await response.json();
            console.log('[X4 Upload] Root directory contents:', items);

            // Check if our folder exists (type: "dir")
            const folder = items.find(item =>
                item.type === 'dir' && item.name === folderName
            );

            return !!folder;

        } catch (error) {
            console.error('[X4 Upload] Error listing directory:', error);
            return false;
        }
    },

    /**
     * Create a folder using PUT /edit
     * @param {string} folderName 
     * @returns {Promise<boolean>}
     */
    async createFolder(folderName) {
        try {
            const formData = new FormData();
            formData.append('path', `/${folderName}/`);

            const response = await fetch(this.UPLOAD_ENDPOINT, {
                method: 'PUT',
                body: formData
            });

            console.log('[X4 Upload] Create folder response:', response.status);

            if (response.ok) {
                console.log('[X4 Upload] Folder created successfully');
                return true;
            } else {
                const text = await response.text();
                console.error('[X4 Upload] Failed to create folder:', text);
                return false;
            }

        } catch (error) {
            console.error('[X4 Upload] Error creating folder:', error);
            return false;
        }
    },

    /**
     * Upload file to specified path
     * @param {ArrayBuffer} data 
     * @param {string} path - Full path including filename (e.g., /send-to-x4/file.epub)
     * @returns {Promise<{success: boolean, error?: string}>}
     */
    async uploadFile(data, path) {
        try {
            const blob = new Blob([data], { type: 'application/epub+zip' });
            const formData = new FormData();

            // The filename in FormData includes the path
            const file = new File([blob], path, { type: 'application/epub+zip' });
            formData.append('data', file, path);

            console.log('[X4 Upload] Sending POST to', this.UPLOAD_ENDPOINT);

            const response = await fetch(this.UPLOAD_ENDPOINT, {
                method: 'POST',
                body: formData
            });

            console.log('[X4 Upload] Response status:', response.status);

            if (response.ok) {
                const responseText = await response.text();
                console.log('[X4 Upload] Success! Response:', responseText);
                return { success: true };
            } else {
                const errorText = await response.text();
                console.error('[X4 Upload] Error response:', errorText);
                return {
                    success: false,
                    error: `Upload failed with status ${response.status}`
                };
            }

        } catch (error) {
            console.error('[X4 Upload] Fetch error:', error);

            if (error.name === 'TypeError' && error.message.includes('Failed to fetch')) {
                return {
                    success: false,
                    error: 'Cannot reach X4. Make sure you are on X4 WiFi.'
                };
            }

            return { success: false, error: error.message };
        }
    }
};
