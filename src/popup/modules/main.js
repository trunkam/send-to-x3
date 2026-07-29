import { UIManager } from './ui_manager.js';
import { FileManager } from './file_manager.js';
import { ArticleManager } from './article_manager.js';
import { addArticle, addFiles, listQueue, removeItem, updateItem, recoverInterruptedItems } from '../../queue/queue_store.js';

// Cross-browser compatibility
const browserAPI = typeof browser !== 'undefined' ? browser : chrome;

// Global settings object from settings.js (loaded via script tag)
// We assume Settings is available on window/global scope

class PopupController {
    constructor() {
        this.ui = new UIManager();
        this.fileManager = new FileManager();
        this.articleManager = new ArticleManager();
        this.settings = { firmwareType: 'stock', deviceIp: '192.168.3.3', settingsPanelOpen: false, organizeByDate: false, targetFolder: 'send-to-x4' };
        this.currentSort = 'newest'; // Default sort
        this.queueItems = [];
        this.sendingQueue = false;
        this.stopQueueRequested = false;
        this.deviceConnected = false;
    }

    async init() {
        console.log('[Popup Controller] Initializing...');
        await this.loadSettings();

        // Setup listeners
        this.ui.setupListeners({
            onSend: () => this.handleSend(),
            onDownload: () => this.handleDownload(),
            onQueueArticle: () => this.handleQueueArticle(),
            onImportFiles: (event) => this.handleImportFiles(event),
            onSendAll: () => this.handleSendAll(),
            onStopQueue: () => { this.stopQueueRequested = true; this.ui.setQueueProgress('Stopping after the current transfer…'); },
            onOrganizeByDate: (event) => this.handleOrganizeByDate(event),
            onSettingsChange: (e) => this.handleSettingsChange(e),
            onIpChange: (e) => this.handleIpChange(e),
            onTargetFolderChange: (e) => this.handleTargetFolderChange(e),
            onConnect: () => this.handleConnect(),
            onRefreshDevice: () => this.handleDeviceRefresh(),
            onSettingsToggle: () => this.handleSettingsToggle(),
            onSortChange: (e) => this.handleSortChange(e)
        });

        // Check for updates
        browserAPI.runtime.onMessage.addListener((message) => {
            if (message.type === 'X4_STATUS_UPDATE') {
                console.log('[Popup Controller] Status update:', message);
                // Map status to button state or log
                if (message.status === 'generating') {
                    this.ui.setSendButtonState('loading', 'Generating EPUB...');
                } else if (message.status === 'uploading') {
                    this.ui.setSendButtonState('loading', 'Uploading to X4...');
                } else if (message.status === 'downloading') {
                    this.ui.setSendButtonState('loading', 'Downloading...');
                }
            } else if (message.type === 'X4_DEBUG_LOG') {
                console.log('[SW Log]', message.message);
            }
        });

        // Run checks in parallel
        await recoverInterruptedItems();
        await Promise.all([
            this.checkArticle(),
            this.checkDevice(),
            this.refreshQueue()
        ]);
    }

    async loadSettings() {
        if (window.Settings) {
            try {
                const allSettings = await window.Settings.getAll();
                this.settings.firmwareType = allSettings.firmwareType;
                this.settings.deviceIp = allSettings.deviceIp;
                this.settings.settingsPanelOpen = allSettings.settingsPanelOpen;
                this.settings.organizeByDate = allSettings.organizeByDate;
                this.settings.targetFolder = allSettings.targetFolder;

                this.ui.updateSettingsUI(this.settings);
                this.ui.setSettingsPanelState(this.settings.settingsPanelOpen);

                console.log('[Popup Controller] Settings loaded:', this.settings);
            } catch (error) {
                console.error('[Popup Controller] Error loading settings:', error);
            }
        } else {
            console.error('[Popup Controller] Settings module not found!');
        }
    }

    // --- Actions ---

    async checkArticle() {
        try {
            const article = await this.articleManager.checkArticle();
            if (article) {
                this.ui.showArticleFound(article);
            } else {
                // Determine if it was an error or just not found? 
                // ArticleManager returns null on "not found" (e.g. too short).
                this.ui.showArticleNotFound();
            }
        } catch (error) {
            console.error('[Popup Controller] Article check failed:', error);
            // If error is "No active tab", show error?
            this.ui.showArticleError(error.message);
        }
    }

    async checkDevice(force = false) {
        if (force) {
            this.ui.setConnectButtonState('loading');
        } else {
            // Initial check doesn't spin the connect button, maybe spins a general loading indicator?
            // Original code: this.elements.deviceLoading...
            // UIManager handles this in showDeviceConnected/Disconnected which hides loading.
            // But we need to SHOW loading first? UIManager doesn't have a specific showLoading method for device, 
            // but the HTML starts with loading visible.
        }

        const result = await this.fileManager.checkDevice(this.settings);

        if (result.connected) {
            this.deviceConnected = true;
            this.ui.showDeviceConnected(this.settings.deviceIp);

            // Load files
            const files = await this.fileManager.loadFolderFiles(this.settings);
            this.ui.showFileList(files, (filename, li) => this.handleDelete(filename, li), this.fileManager.lastLoadError);

            if (force) this.ui.setConnectButtonState('success');
            return true;
        } else {
            this.deviceConnected = false;
            this.ui.showDeviceDisconnected();
            if (force) this.ui.setConnectButtonState('error');
            return false;
        }
    }

    // --- Handlers ---

    async handleSettingsChange(event) {
        // This is now Firmware Type Change
        const newFirmwareType = event.target.value;
        this.settings.firmwareType = newFirmwareType;

        if (window.Settings) {
            await window.Settings.setFirmwareType(newFirmwareType);

            // Reload settings to get the stored IP for this firmware type
            const updatedSettings = await window.Settings.getAll();
            this.settings.deviceIp = updatedSettings.deviceIp;

            // Re-update UI to reflect the correct IP
            this.ui.updateSettingsUI(this.settings);
        }

        // Refresh device
        await this.checkDevice();
    }

    async handleIpChange(event) {
        const newIp = event.target.value.trim();
        if (!newIp) return;

        this.settings.deviceIp = newIp;

        if (window.Settings) {
            await window.Settings.setDeviceIp(newIp);
        }
        console.log('[Popup Controller] IP saved:', newIp);
    }

    async handleTargetFolderChange(event) {
        const rawFolder = event.target.value.trim();
        if (!rawFolder) {
            event.target.value = this.settings.targetFolder;
            return;
        }

        const sanitized = window.Settings
            ? window.Settings.sanitizeFolderName(rawFolder)
            : rawFolder;

        this.settings.targetFolder = sanitized;
        event.target.value = sanitized;
        this.ui.updateFolderLabel(sanitized);

        if (window.Settings) {
            await window.Settings.setTargetFolder(sanitized);
        }
        console.log('[Popup Controller] Target folder saved:', sanitized);

        if (!this.ui.elements.deviceConnected.classList.contains('hidden')) {
            const files = await this.fileManager.loadFolderFiles(this.settings, this.currentSort);
            this.ui.showFileList(files, (filename, li) => this.handleDelete(filename, li));
        }
    }

    async handleConnect() {
        // Force save current input value first
        const currentInput = this.ui.getSettingsFromUI().deviceIp;
        if (currentInput && currentInput !== this.settings.deviceIp) {
            await this.handleIpChange({ target: { value: currentInput } });
        }

        await this.checkDevice(true);
    }

    async handleDeviceRefresh() {
        this.ui.setDeviceRefreshState(true);
        try {
            await this.checkDevice();
        } finally {
            this.ui.setDeviceRefreshState(false);
        }
    }

    async handleSortChange(event) {
        this.currentSort = event.target.value;
        // Reload files to apply sort
        const files = await this.fileManager.loadFolderFiles(this.settings, this.currentSort);
        this.ui.showFileList(files, (filename, li) => this.handleDelete(filename, li));
    }

    async handleSettingsToggle() {
        this.settings.settingsPanelOpen = !this.settings.settingsPanelOpen;
        this.ui.setSettingsPanelState(this.settings.settingsPanelOpen);

        if (window.Settings) {
            await window.Settings.setSettingsPanelOpen(this.settings.settingsPanelOpen);
        }
    }

    async handleOrganizeByDate(event) {
        this.settings.organizeByDate = event.target.checked;
        await window.Settings.setOrganizeByDate(this.settings.organizeByDate);
    }

    async refreshQueue() {
        this.queueItems = await listQueue();
        this.ui.showQueue(this.queueItems, {
            sending: this.sendingQueue,
            onSendItem: item => this.sendQueueItem(item),
            onRemoveItem: item => this.handleRemoveQueueItem(item)
        });
    }

    async handleQueueArticle() {
        if (!this.articleManager.articleData) return;
        try {
            await addArticle(this.articleManager.articleData);
            await this.refreshQueue();
            this.ui.setQueueProgress('Article added to the local queue.');
        } catch (error) {
            this.ui.setQueueProgress(error.message);
        }
    }

    async handleImportFiles(event) {
        try {
            const files = Array.from(event.target.files || []);
            if (files.length) await addFiles(files);
            await this.refreshQueue();
            this.ui.setQueueProgress(files.length ? `${files.length} file${files.length === 1 ? '' : 's'} added to the queue.` : '');
        } catch (error) {
            this.ui.setQueueProgress(error.message);
        } finally {
            event.target.value = '';
        }
    }

    async handleRemoveQueueItem(item) {
        if (!confirm(`Remove "${item.displayName}" from the local queue?`)) return;
        await removeItem(item.id);
        await this.refreshQueue();
    }

    async handleSendAll() {
        this.sendingQueue = true;
        this.stopQueueRequested = false;
        try {
            for (const item of [...this.queueItems]) {
                const result = await this.sendQueueItem(item, true);
                if (!result.success && result.connectivityFailure) {
                    this.ui.setQueueProgress('Connection to X4 was lost. Remaining items are still queued.');
                    break;
                }
                if (this.stopQueueRequested) break;
            }
        } finally {
            this.sendingQueue = false;
            await this.refreshQueue();
        }
    }

    async sendQueueItem(item, batch = false) {
        if (this.sendingQueue && !batch) return;
        if (!batch) this.sendingQueue = true;
        const position = this.queueItems.findIndex(candidate => candidate.id === item.id) + 1;
        const current = { ...item, status: 'sending', lastError: null, attempts: (item.attempts || 0) + 1, lastAttemptAt: new Date().toISOString() };
        await updateItem(current);
        await this.refreshQueue();
        this.ui.setQueueProgress(`Sending ${position} of ${this.queueItems.length}: ${item.displayName}`);
        try {
            const targetDirectory = TransferUtils.destination(this.settings.targetFolder, this.settings.organizeByDate, item.contentDate || item.createdAt);
            const response = await browserAPI.runtime.sendMessage({ type: 'X4_UPLOAD_QUEUE_ITEM', payload: { itemId: current.id, targetDirectory }, settings: { firmwareType: this.settings.firmwareType, deviceIp: this.settings.deviceIp } });
            if (!response?.success) throw new Error(response?.error || 'Upload failed.');
            await removeItem(item.id);
            this.ui.setQueueProgress(`Sent: ${item.displayName}`);
            await this.refreshQueue();
            if (!batch) await this.checkDevice();
            return { success: true, connectivityFailure: false };
        } catch (error) {
            const message = error.message || 'Upload failed.';
            await updateItem({ ...current, status: 'failed', lastError: message });
            this.ui.setQueueProgress(`Failed: ${message}`);
            await this.refreshQueue();
            return { success: false, connectivityFailure: TransferUtils.isConnectivityError(message) };
        } finally {
            if (!batch) {
                this.sendingQueue = false;
                await this.refreshQueue();
            }
        }
    }

    async handleDelete(file, liElement) {
        const filename = typeof file === 'string' ? file : file.name;
        if (!confirm(`Delete "${filename}" from X4?`)) return;

        liElement.classList.add('deleting'); // UI optimistically? UIManager should handle this ideally but we passed liElement
        // Actually UIManager doesn't expose class manipulation for list items easily.
        // We can access properties on liElement directly since it's a DOM node passed back.

        try {
            await this.fileManager.deleteFile(file, this.settings);
            // On success, remove from UI
            liElement.remove();

            // Update count? UIManager needs to know.
            // Reload files to be safe and update count
            const files = await this.fileManager.loadFolderFiles(this.settings);
            this.ui.showFileList(files, (f, l) => this.handleDelete(f, l));

        } catch (error) {
            console.error('[Popup Controller] Delete error:', error);
            alert(`Failed to delete file: ${error.message}`);
            liElement.classList.remove('deleting');
        }
    }

    async handleSend() {
        const article = this.articleManager.articleData;
        if (!article || !this.deviceConnected) return;

        const uiSettings = this.ui.getSettingsFromUI();
        if (uiSettings.targetFolder && uiSettings.targetFolder !== this.settings.targetFolder) {
            await this.handleTargetFolderChange({ target: { value: uiSettings.targetFolder } });
        }

        this.ui.setSendButtonState('sending');

        try {
            // Wrap sendMessage in a timeout promise
            const sendMessagePromise = browserAPI.runtime.sendMessage({
                type: 'X4_SEND_ARTICLE',
                payload: {
                    kind: 'generic_article',
                    ...article
                },
                settings: {
                    firmwareType: this.settings.firmwareType,
                    deviceIp: this.settings.deviceIp,
                    targetFolder: this.settings.targetFolder
                }
            });

            // 60s timeout for the whole process (generation + upload)
            const timeoutPromise = new Promise((_, reject) => {
                setTimeout(() => reject(new Error('Operation timed out (60s)')), 60000);
            });

            const response = await Promise.race([sendMessagePromise, timeoutPromise]);

            if (response && response.success) {
                this.ui.setSendButtonState('success', response.message);

                // Refresh files after delay
                setTimeout(async () => {
                    const files = await this.fileManager.loadFolderFiles(this.settings);
                    this.ui.showFileList(files, (f, l) => this.handleDelete(f, l));
                }, 1500);
            } else {
                this.ui.setSendButtonState('error', response?.error || 'Unknown error');
            }
        } catch (error) {
            console.error('[Popup Controller] Send error:', error);
            this.ui.setSendButtonState('error', error.message);
        }
    }

    async handleDownload() {
        const article = this.articleManager.articleData;
        if (!article) return;

        this.ui.setDownloadButtonState('downloading');

        try {
            const response = await browserAPI.runtime.sendMessage({
                type: 'X4_DOWNLOAD_ARTICLE',
                payload: {
                    kind: 'generic_article',
                    ...article
                }
            });

            if (response && response.success) {
                this.ui.setDownloadButtonState('success');
            } else {
                this.ui.setDownloadButtonState('error', response?.error || 'Unknown error');
            }
        } catch (error) {
            console.error('[Popup Controller] Download error:', error);
            this.ui.setDownloadButtonState('error', error.message);
        }
    }
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    const controller = new PopupController();
    controller.init();
});
