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
        this.settings = { firmwareType: 'crosspoint', deviceIp: '172.16.24.159', deviceIps: ['172.16.24.159', '192.168.1.25'], settingsPanelOpen: false, organizeByDate: false, targetFolder: 'send-to-x3' };
        this.currentSort = 'newest'; // Default sort
        this.queueItems = [];
        this.sendingQueue = false;
        this.stopQueueRequested = false;
        this.deviceConnected = false;
        this.dropboxSyncing = false;
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
            onDropboxSync: () => this.handleDropboxSync(),
            onDropboxConnect: () => this.handleDropboxConnect(),
            onDropboxDisconnect: () => this.handleDropboxDisconnect(),
            onDropboxCodeSave: () => this.handleDropboxCodeSave(),
            onDropboxFolderChange: (event) => this.handleDropboxFolderChange(event),
            onDropboxAppKeyChange: (event) => this.handleDropboxAppKeyChange(event),
            onDropboxAutoSyncChange: (event) => this.handleDropboxAutoSyncChange(event),
            onSendAll: () => this.handleSendAll(),
            onStopQueue: () => { this.stopQueueRequested = true; this.ui.setQueueProgress('Stopping after the current transfer…'); },
            onOrganizeByDate: (event) => this.handleOrganizeByDate(event),
            onSettingsChange: (e) => this.handleSettingsChange(e),
            onIpChange: () => this.handleIpListChange(),
            onIpRemove: () => this.handleIpListChange(),
            onAddIp: () => this.ui.addEmptyIpRow(),
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
                    this.ui.setSendButtonState('loading', 'Uploading to X3...');
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
            this.refreshQueue(),
            this.loadDropboxState()
        ]);
        // After the state is on screen: may finish an authorisation started
        // before the popup was closed by the consent tab.
        await this.completeDropboxIfPossible();
        // Not awaited: the popup stays responsive while Dropbox is contacted.
        this.autoSyncDropboxIfEnabled();
    }

    async loadSettings() {
        if (window.Settings) {
            try {
                const allSettings = await window.Settings.getAll();
                this.settings.firmwareType = allSettings.firmwareType;
                this.settings.deviceIp = allSettings.deviceIp;
                this.settings.deviceIps = allSettings.deviceIps;
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
                this.ui.showArticleNotFound(this.articleManager.lastFailureDetail);
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

            // Whichever address answered becomes the one we talk to, and the
            // first one probed next time
            if (result.ip && result.ip !== this.settings.deviceIp) {
                this.settings.deviceIp = result.ip;
                if (window.Settings) {
                    await window.Settings.setActiveDeviceIp(result.ip);
                }
            }

            this.ui.showDeviceConnected(this.settings.deviceIp);
            this.ui.markActiveIp(this.settings.deviceIp);

            // Load files
            const files = await this.fileManager.loadFolderFiles(this.settings);
            this.ui.showFileList(files, (filename, li) => this.handleDelete(filename, li), this.fileManager.lastLoadError);

            if (force) this.ui.setConnectButtonState('success');
            return true;
        } else {
            this.deviceConnected = false;
            this.ui.showDeviceDisconnected();
            this.ui.markActiveIp(null);
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

            // Reload settings to get the stored addresses for this firmware type
            const updatedSettings = await window.Settings.getAll();
            this.settings.deviceIp = updatedSettings.deviceIp;
            this.settings.deviceIps = updatedSettings.deviceIps;

            // Re-update UI to reflect the correct IP
            this.ui.updateSettingsUI(this.settings);
        }

        // Refresh device
        await this.checkDevice();
    }

    /**
     * Persist whatever addresses the panel currently shows.
     * @returns {Promise<void>}
     */
    async saveIpList() {
        const ips = this.ui.getDeviceIpsFromUI();

        if (window.Settings) {
            await window.Settings.setDeviceIps(ips);
            // Read back rather than trust the write: emptying the list brings
            // the defaults back, and the panel has to show that
            this.settings.deviceIps = await window.Settings.getDeviceIps();
            this.settings.deviceIp = await window.Settings.getDeviceIp();
        } else {
            this.settings.deviceIps = ips;
            this.settings.deviceIp = ips[0] || this.settings.deviceIp;
        }

        // Redraw so a pasted URL shows up in the form we actually stored.
        // Safe here: 'change' fires on blur, so no field has focus.
        this.ui.renderDeviceIps(this.settings.deviceIps, this.settings.deviceIp);
        console.log('[Popup Controller] Device addresses saved:', this.settings.deviceIps);
    }

    async handleIpListChange() {
        await this.saveIpList();
        await this.checkDevice();
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
        // Save whatever is typed before probing it
        await this.saveIpList();
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

    /**
     * Queue one file, whether it came from Android's picker or from Dropbox.
     * Kept separate so both paths share the HTML/EPUB decision instead of
     * drifting apart.
     * @param {File} file
     * @returns {Promise<void>} rejects with the reason the file could not be queued
     */
    async importOneFile(file) {
        if (HtmlArticle.isHtmlFilename(file.name)) {
            // Raw HTML from the iPad Shortcut: queue it as an article, so it
            // gets the same EPUB, filename and date folder as an extracted page.
            await addArticle(HtmlArticle.parse(await file.text(), {
                filename: file.name,
                date: TransferUtils.dateFolder(new Date(file.lastModified || Date.now()))
            }));
        } else {
            await addFiles([file]);
        }
    }

    async handleImportFiles(event) {
        const files = Array.from(event.target.files || []);
        event.target.value = '';
        if (!files.length) return;

        let added = 0;
        const failures = [];
        // One file at a time: a single unsupported pick used to discard the whole
        // selection, and the shared folder is imported in batches.
        for (const file of files) {
            try {
                await this.importOneFile(file);
                added++;
            } catch (error) {
                failures.push(`${file.name}: ${error.message}`);
            }
        }

        await this.refreshQueue();
        const summary = added ? `${added} file${added === 1 ? '' : 's'} added to the queue.` : '';
        this.ui.setQueueProgress([summary, ...failures].join(' ').trim());
    }

    // --- Dropbox -----------------------------------------------------------

    // Hours and minutes only: it is there to say "just now", not to timestamp.
    clockTime() {
        return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }

    async loadDropboxState(message) {
        if (!window.Settings) return null;
        const config = await window.Settings.getDropbox();
        const pending = await window.Settings.getDropboxVerifier();
        this.ui.showDropboxState({
            connected: Boolean(config.refreshToken),
            appKey: config.appKey,
            folder: config.folder,
            sentFolder: config.sentFolder,
            autoSync: config.autoSync,
            // The box stays open across popup closures, which is the only way
            // this flow can work on Android.
            awaitingCode: Boolean(pending) && !config.refreshToken,
            message: message || (pending && !config.refreshToken
                ? 'Waiting for the code from Dropbox. Paste it below.'
                : undefined)
        });
        return config;
    }

    /* Opens Dropbox's consent page in a tab. On Firefox Android that closes the
       popup, so the verifier is written to storage first: when the popup comes
       back it is the only way to match the pasted code. It is cleared as soon as
       it is spent, and expires by itself after half an hour. */
    async handleDropboxAppKeyChange(event) {
        await window.Settings.setDropboxConfig({ appKey: event.target.value });
        await this.loadDropboxState('App key saved.');
    }

    async handleDropboxConnect() {
        try {
            const config = await window.Settings.getDropbox();
            if (!config.appKey) {
                await this.loadDropboxState('Enter your Dropbox app key first, from dropbox.com/developers/apps.');
                return;
            }
            const verifier = DropboxClient.createVerifier();
            await window.Settings.setDropboxVerifier(verifier);
            const url = await DropboxClient.authorizeUrl(config.appKey, verifier);
            await this.loadDropboxState('Authorise in the tab that opened, then reopen this popup and paste the code.');
            await browserAPI.tabs.create({ url });
        } catch (error) {
            await this.loadDropboxState(`Could not start authorisation: ${error.message}`);
        }
    }

    /* After consent Dropbox lands on authorize_success?auth_code=…, so the code
       is sitting in a tab we are allowed to read. Saves the user copying a
       40-character string on a phone. Returns '' when that tab is not there. */
    async findDropboxCodeInTabs() {
        try {
            const tabs = await browserAPI.tabs.query({});
            for (const tab of tabs) {
                const url = tab.url || '';
                if (url.includes('/oauth2/authorize_success') && url.includes('auth_code=')) {
                    return new URL(url).searchParams.get('auth_code') || '';
                }
            }
        } catch (error) {
            console.error('[Popup Controller] Could not read tabs for the Dropbox code:', error);
        }
        return '';
    }

    // Runs on popup open: finishes the connection by itself when the consent
    // tab is still around, so the paste box is only a fallback.
    async completeDropboxIfPossible() {
        if (!window.Settings) return;
        const config = await window.Settings.getDropbox();
        if (config.refreshToken) return;
        if (!await window.Settings.getDropboxVerifier()) return;

        const code = await this.findDropboxCodeInTabs();
        if (!code) return;
        await this.handleDropboxCodeSave(code);
    }

    async handleDropboxCodeSave(codeFromTab) {
        const typed = this.ui.elements.dropboxCodeInput ? this.ui.elements.dropboxCodeInput.value : '';
        const code = typeof codeFromTab === 'string' && codeFromTab ? codeFromTab : typed;
        if (!code.trim()) {
            await this.loadDropboxState('Paste the code Dropbox showed you first.');
            return;
        }
        const verifier = await window.Settings.getDropboxVerifier();
        if (!verifier) {
            await this.loadDropboxState('That attempt has expired. Press Connect again.');
            return;
        }
        try {
            const config = await window.Settings.getDropbox();
            const refreshToken = await DropboxClient.exchangeCode(config.appKey, code, verifier);
            await window.Settings.setDropboxRefreshToken(refreshToken);
            await window.Settings.setDropboxVerifier('');
            if (this.ui.elements.dropboxCodeInput) this.ui.elements.dropboxCodeInput.value = '';
            await this.loadDropboxState('Connected to Dropbox.');
        } catch (error) {
            await this.loadDropboxState(`Dropbox refused the code: ${error.message}`);
        }
    }

    async handleDropboxDisconnect() {
        await window.Settings.setDropboxRefreshToken('');
        await window.Settings.setDropboxVerifier('');
        await this.loadDropboxState('Disconnected. Files on Dropbox are untouched.');
    }

    async handleDropboxFolderChange(event) {
        await window.Settings.setDropboxConfig({ folder: event.target.value });
        await this.loadDropboxState('Folder saved.');
    }

    async handleDropboxAutoSyncChange(event) {
        await window.Settings.setDropboxAutoSync(event.target.checked);
        await this.loadDropboxState(event.target.checked
            ? 'Dropbox will be checked when the popup opens.'
            : 'Dropbox will only be checked when you press From Dropbox.');
    }

    /* Runs once the popup is on screen, and deliberately not awaited by init():
       the window has to be usable straight away, even when Dropbox is slow or
       the phone is offline. */
    async autoSyncDropboxIfEnabled() {
        if (!window.Settings) return;
        const config = await window.Settings.getDropbox();
        if (!config.autoSync || !config.refreshToken) return;
        await this.handleDropboxSync({ auto: true });
    }

    /* Pulls whatever is waiting in the Dropbox folder into the queue. A file is
       moved into the "sent" sub-folder only once it is safely queued, so a
       failure here leaves it where it is and the next run tries again. */
    async handleDropboxSync(options = {}) {
        /* `auto` marks the run started on popup open. It only suppresses the
           "connect it first" nudge, which would greet anyone who never set
           Dropbox up. The outcome is always reported, empty folder included:
           without it there is no telling a check that found nothing from a check
           that never ran. */
        const auto = Boolean(options.auto);
        if (this.dropboxSyncing) return;
        const config = await window.Settings.getDropbox();
        if (!config.appKey || !config.refreshToken) {
            if (!auto) this.ui.setQueueProgress('Connect Dropbox in Settings first.');
            return;
        }

        this.dropboxSyncing = true;
        try {
            this.ui.setQueueProgress('Checking Dropbox…');
            const token = await DropboxClient.accessTokenFrom(config.appKey, config.refreshToken);
            const entries = await DropboxClient.list(token, config.folder);
            if (!entries.length) {
                this.ui.setQueueProgress(`Dropbox checked at ${this.clockTime()}: nothing new.`);
                return;
            }

            let added = 0;
            const failures = [];
            for (const entry of entries) {
                try {
                    this.ui.setQueueProgress(`Downloading ${entry.name}…`);
                    const blob = await DropboxClient.download(token, entry.path);
                    await this.importOneFile(new File([blob], entry.name, { lastModified: entry.modified }));
                    added++;
                    // Only now is it safe to take it out of the way.
                    await DropboxClient.moveToSent(token, entry, config.folder, config.sentFolder);
                } catch (error) {
                    failures.push(`${entry.name}: ${error.message}`);
                }
            }

            await this.refreshQueue();
            const summary = added
                ? `${added} file${added === 1 ? '' : 's'} added from Dropbox at ${this.clockTime()}.`
                : 'Nothing was imported.';
            this.ui.setQueueProgress([summary, ...failures].join(' ').trim());
        } catch (error) {
            this.ui.setQueueProgress(`Dropbox check failed at ${this.clockTime()}: ${error.message}`);
        } finally {
            this.dropboxSyncing = false;
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
                    this.ui.setQueueProgress('Connection to X3 was lost. Remaining items are still queued.');
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
        if (!confirm(`Delete "${filename}" from X3?`)) return;

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
