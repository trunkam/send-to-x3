/**
 * UI Manager
 * Handles DOM elements, event listeners, and UI updates
 */
export class UIManager {
    constructor() {
        this.elements = {};
        this.deviceConnected = false;
        this.sendInProgress = false;
        this.cacheElements();
    }

    cacheElements() {
        this.elements = {
            articleLoading: document.getElementById('article-loading'),
            articleFound: document.getElementById('article-found'),
            articleNotFound: document.getElementById('article-not-found'),
            articleNotFoundDetail: document.getElementById('article-not-found-detail'),
            articleError: document.getElementById('article-error'),
            articleTitle: document.getElementById('article-title'),
            articleAuthor: document.getElementById('article-author'),
            articleWords: document.getElementById('article-words'),
            errorMessage: document.getElementById('error-message'),
            sendBtn: document.getElementById('send-btn'),
            downloadBtn: document.getElementById('download-btn'),
            queueArticleBtn: document.getElementById('queue-article-btn'),
            importFiles: document.getElementById('import-files'),
            sendAllBtn: document.getElementById('send-all-btn'),
            stopQueueBtn: document.getElementById('stop-queue-btn'),
            queueCount: document.getElementById('queue-count'),
            queueItems: document.getElementById('queue-items'),
            queueProgress: document.getElementById('queue-progress'),
            organizeByDate: document.getElementById('organize-by-date'),
            deviceLoading: document.getElementById('device-loading'),
            deviceConnected: document.getElementById('device-connected'),
            deviceConnectedLabel: document.getElementById('device-connected-label'),
            deviceDisconnected: document.getElementById('device-disconnected'),
            deviceRefreshBtn: document.getElementById('device-refresh-btn'),
            deviceFiles: document.getElementById('device-files'),
            fileCount: document.getElementById('file-count'),
            fileListItems: document.getElementById('file-list-items'),
            folderLabel: document.getElementById('folder-label'),
            firmwareTypeSelect: document.getElementById('firmware-type'),
            targetFolderInput: document.getElementById('target-folder'),
            deviceIpContainer: document.getElementById('device-ip-container'),
            deviceIpList: document.getElementById('device-ip-list'),
            addIpBtn: document.getElementById('add-ip-btn'),
            connectBtn: document.getElementById('connect-btn'),
            settingsHeader: document.getElementById('settings-header'),
            settingsContent: document.getElementById('settings-content'),
            settingsToggleIcon: document.getElementById('settings-toggle-icon'),
            sortSelect: document.getElementById('sort-order'),
            dropboxSyncBtn: document.getElementById('dropbox-sync-btn'),
            dropboxAutoSync: document.getElementById('dropbox-auto-sync'),
            dropboxAppKeyInput: document.getElementById('dropbox-app-key'),
            dropboxFolderInput: document.getElementById('dropbox-folder'),
            dropboxSentLabel: document.getElementById('dropbox-sent-label'),
            dropboxStatus: document.getElementById('dropbox-status'),
            dropboxConnectBtn: document.getElementById('dropbox-connect-btn'),
            dropboxDisconnectBtn: document.getElementById('dropbox-disconnect-btn'),
            dropboxCodeRow: document.getElementById('dropbox-code-row'),
            dropboxCodeInput: document.getElementById('dropbox-code'),
            dropboxCodeSaveBtn: document.getElementById('dropbox-code-save-btn')
        };
    }

    /**
     * Reflect the Dropbox connection in the settings panel.
     * @param {{connected: boolean, folder?: string, sentFolder?: string, message?: string, awaitingCode?: boolean}} state
     */
    showDropboxState(state = {}) {
        const connected = Boolean(state.connected);
        if (this.elements.dropboxStatus) {
            this.elements.dropboxStatus.textContent = state.message
                || (connected ? 'Connected to Dropbox.' : 'Not connected.');
        }
        if (this.elements.dropboxConnectBtn) {
            this.elements.dropboxConnectBtn.classList.toggle('hidden', connected);
        }
        if (this.elements.dropboxDisconnectBtn) {
            this.elements.dropboxDisconnectBtn.classList.toggle('hidden', !connected);
        }
        if (this.elements.dropboxCodeRow) {
            // The code box only makes sense between "Connect" and the paste.
            this.elements.dropboxCodeRow.classList.toggle('hidden', !state.awaitingCode);
        }
        if (typeof state.folder === 'string' && this.elements.dropboxFolderInput) {
            this.elements.dropboxFolderInput.value = state.folder;
        }
        if (typeof state.appKey === 'string' && this.elements.dropboxAppKeyInput) {
            this.elements.dropboxAppKeyInput.value = state.appKey;
        }
        if (typeof state.sentFolder === 'string' && this.elements.dropboxSentLabel) {
            this.elements.dropboxSentLabel.textContent = state.sentFolder;
        }
        if (typeof state.autoSync === 'boolean' && this.elements.dropboxAutoSync) {
            this.elements.dropboxAutoSync.checked = state.autoSync;
        }
    }

    setupListeners(handlers) {
        if (handlers.onSend) this.elements.sendBtn.addEventListener('click', handlers.onSend);
        if (handlers.onDownload) this.elements.downloadBtn.addEventListener('click', handlers.onDownload);
        if (handlers.onQueueArticle) this.elements.queueArticleBtn.addEventListener('click', handlers.onQueueArticle);
        if (handlers.onImportFiles) this.elements.importFiles.addEventListener('change', handlers.onImportFiles);
        if (handlers.onDropboxSync) this.elements.dropboxSyncBtn.addEventListener('click', handlers.onDropboxSync);
        if (handlers.onDropboxAutoSyncChange) this.elements.dropboxAutoSync.addEventListener('change', handlers.onDropboxAutoSyncChange);
        if (handlers.onDropboxConnect) this.elements.dropboxConnectBtn.addEventListener('click', handlers.onDropboxConnect);
        if (handlers.onDropboxDisconnect) this.elements.dropboxDisconnectBtn.addEventListener('click', handlers.onDropboxDisconnect);
        if (handlers.onDropboxCodeSave) this.elements.dropboxCodeSaveBtn.addEventListener('click', handlers.onDropboxCodeSave);
        if (handlers.onDropboxFolderChange) this.elements.dropboxFolderInput.addEventListener('change', handlers.onDropboxFolderChange);
        if (handlers.onDropboxAppKeyChange) this.elements.dropboxAppKeyInput.addEventListener('change', handlers.onDropboxAppKeyChange);
        if (handlers.onSendAll) this.elements.sendAllBtn.addEventListener('click', handlers.onSendAll);
        if (handlers.onStopQueue) this.elements.stopQueueBtn.addEventListener('click', handlers.onStopQueue);
        if (handlers.onOrganizeByDate) this.elements.organizeByDate.addEventListener('change', handlers.onOrganizeByDate);
        if (handlers.onSettingsChange) this.elements.firmwareTypeSelect.addEventListener('change', handlers.onSettingsChange);
        if (handlers.onIpChange) {
            // Delegated: rows come and go as addresses are added or removed
            this.elements.deviceIpList.addEventListener('change', (event) => {
                if (event.target.classList.contains('ip-input')) handlers.onIpChange(event);
            });
        }
        if (handlers.onIpRemove) {
            this.elements.deviceIpList.addEventListener('click', (event) => {
                const button = event.target.closest('.ip-remove');
                if (!button) return;
                button.closest('.ip-row')?.remove();
                if (!this.elements.deviceIpList.querySelector('.ip-row')) {
                    this.addEmptyIpRow();
                }
                handlers.onIpRemove();
            });
        }
        if (handlers.onAddIp) this.elements.addIpBtn.addEventListener('click', handlers.onAddIp);
        if (handlers.onTargetFolderChange) this.elements.targetFolderInput.addEventListener('change', handlers.onTargetFolderChange);
        if (handlers.onConnect) this.elements.connectBtn.addEventListener('click', handlers.onConnect);
        if (handlers.onRefreshDevice) this.elements.deviceRefreshBtn.addEventListener('click', handlers.onRefreshDevice);
        if (handlers.onSettingsToggle) this.elements.settingsHeader.addEventListener('click', handlers.onSettingsToggle);
        if (handlers.onSortChange) this.elements.sortSelect.addEventListener('change', handlers.onSortChange);
    }

    // --- Settings Panel ---

    setSettingsPanelState(isOpen) {
        if (isOpen) {
            this.elements.settingsContent.classList.remove('collapsed');
            this.elements.settingsToggleIcon.classList.add('rotated');
        } else {
            this.elements.settingsContent.classList.add('collapsed');
            this.elements.settingsToggleIcon.classList.remove('rotated');
        }
    }

    // --- Article UI ---

    showArticleFound(article) {
        this.elements.articleLoading.classList.add('hidden');
        this.elements.articleNotFound.classList.add('hidden');
        this.elements.articleError.classList.add('hidden');
        this.elements.articleFound.classList.remove('hidden');

        this.elements.articleTitle.textContent = article.title;
        this.elements.articleAuthor.textContent = article.author;
        this.elements.articleWords.textContent = `${article.wordCount?.toLocaleString() || '—'} words`;
    }

    showArticleNotFound(detail = null) {
        this.elements.articleLoading.classList.add('hidden');
        this.elements.articleFound.classList.add('hidden');
        this.elements.articleError.classList.add('hidden');
        this.elements.articleNotFound.classList.remove('hidden');

        // There is no console to consult on Android, so say what the page
        // actually offered rather than leaving a bare "no article".
        const detailEl = this.elements.articleNotFoundDetail;
        if (detailEl) {
            detailEl.textContent = detail || '';
            detailEl.classList.toggle('hidden', !detail);
        }
    }

    showArticleError(message) {
        this.elements.articleLoading.classList.add('hidden');
        this.elements.articleFound.classList.add('hidden');
        this.elements.articleNotFound.classList.add('hidden');
        this.elements.articleError.classList.remove('hidden');
        this.elements.errorMessage.textContent = message;
    }

    // --- Device UI ---

    showDeviceConnected(ip) {
        this.elements.deviceLoading.classList.add('hidden');
        this.elements.deviceDisconnected.classList.add('hidden');
        this.elements.deviceConnected.classList.remove('hidden');

        // Update the displayed IP address
        this.elements.deviceConnectedLabel.textContent = `Connected to ${ip}`;
        this.setSendAvailability(true);
    }

    showDeviceDisconnected() {
        this.elements.deviceLoading.classList.add('hidden');
        this.elements.deviceConnected.classList.add('hidden');
        this.elements.deviceFiles.classList.add('hidden');
        this.elements.deviceDisconnected.classList.remove('hidden');
        this.setSendAvailability(false);
    }

    setSendAvailability(connected) {
        this.deviceConnected = connected;
        this.elements.sendBtn.disabled = !connected || this.sendInProgress;
    }

    setDeviceRefreshState(refreshing) {
        const btn = this.elements.deviceRefreshBtn;
        btn.disabled = refreshing;
        btn.innerHTML = refreshing ? '<span class="btn-spinner"></span>' : '↻';
    }

    showFileList(files, onDelete, errorMessage = null) {
        this.elements.deviceFiles.classList.remove('hidden');
        this.elements.fileCount.textContent = `${files.length} file${files.length !== 1 ? 's' : ''}`;

        if (files.length === 0) {
            const item = document.createElement('li');
            item.className = 'empty';
            const message = document.createElement('span');
            message.className = 'file-name';
            message.textContent = errorMessage || 'No files yet';
            item.append(message);
            this.elements.fileListItems.replaceChildren(item);
        } else {
            // No slicing - show all files (CSS handles scroll)
            this.elements.fileListItems.replaceChildren();
            files.forEach(file => {
                const li = document.createElement('li');
                const name = document.createElement('span'); name.className = 'file-name'; name.title = file.folder ? `${file.folder}/${file.name}` : file.name; name.textContent = file.folder ? `${file.folder}/${file.name}` : file.name;
                const remove = document.createElement('button'); remove.className = 'delete-btn'; remove.title = 'Delete file'; remove.textContent = '🗑️';
                remove.addEventListener('click', e => { e.stopPropagation(); onDelete(file, li); });
                li.append(name, remove); this.elements.fileListItems.append(li);
            });
        }
    }

    showEmptyFileList() {
        this.elements.deviceFiles.classList.remove('hidden');
        this.elements.fileCount.textContent = '0 files';
        this.elements.fileListItems.innerHTML = '<li class="empty"><span class="file-name">No files yet</span></li>';
    }

    showQueue(items, handlers = {}) {
        const total = items.reduce((sum, item) => sum + (item.size || 0), 0);
        this.elements.queueCount.textContent = `${items.length} item${items.length === 1 ? '' : 's'} · ${this.formatBytes(total)}`;
        this.elements.sendAllBtn.disabled = items.length === 0 || !!handlers.sending;
        this.elements.stopQueueBtn.classList.toggle('hidden', !handlers.sending);
        this.elements.queueItems.replaceChildren();
        if (!items.length) {
            const empty = document.createElement('li'); empty.className = 'empty'; empty.textContent = 'No queued transfers yet'; this.elements.queueItems.append(empty); return;
        }
        for (const item of items) {
            const row = document.createElement('li');
            const name = document.createElement('span'); name.className = 'file-name'; name.textContent = item.displayName;
            const status = item.status === 'failed' ? this.truncateQueueError(item.lastError) : item.status;
            const meta = document.createElement('small'); meta.className = 'queue-meta'; meta.textContent = `${item.kind === 'article' ? 'Article' : item.filename} · ${status}`;
            const details = document.createElement('div'); details.className = 'queue-details'; details.append(name, meta);
            const send = document.createElement('button'); send.className = 'queue-btn'; send.textContent = item.status === 'failed' ? 'Retry' : 'Send'; send.disabled = !!handlers.sending; send.addEventListener('click', () => handlers.onSendItem?.(item));
            const remove = document.createElement('button'); remove.className = 'delete-btn'; remove.textContent = '🗑️'; remove.disabled = !!handlers.sending; remove.addEventListener('click', () => handlers.onRemoveItem?.(item));
            row.append(details, send, remove); this.elements.queueItems.append(row);
        }
    }

    setQueueProgress(message = '') { this.elements.queueProgress.textContent = message; this.elements.queueProgress.classList.toggle('hidden', !message); }
    formatBytes(bytes) { return bytes < 1024 * 1024 ? `${Math.ceil(bytes / 1024)} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`; }
    truncateQueueError(error) { const value = String(error || 'Upload failed.'); return value.length > 96 ? `${value.slice(0, 93)}…` : value; }

    // --- Settings UI ---

    // --- Settings UI ---

    updateSettingsUI(settings) {
        this.elements.firmwareTypeSelect.value = settings.firmwareType;
        this.elements.organizeByDate.checked = !!settings.organizeByDate;
        this.elements.targetFolderInput.value = settings.targetFolder;
        this.updateFolderLabel(settings.targetFolder);
        this.renderDeviceIps(settings.deviceIps, settings.deviceIp);
    }

    /**
     * Draw one editable row per known address, marking the one in use.
     * @param {string[]} ips
     * @param {string} activeIp
     */
    renderDeviceIps(ips, activeIp) {
        const list = this.elements.deviceIpList;
        if (!list) return;

        list.textContent = '';

        const rows = Array.isArray(ips) && ips.length > 0 ? ips : [''];
        for (const ip of rows) {
            list.appendChild(this.buildIpRow(ip, !!ip && ip === activeIp));
        }
    }

    /**
     * @param {string} ip
     * @param {boolean} isActive
     * @returns {HTMLLIElement}
     */
    buildIpRow(ip, isActive) {
        const row = document.createElement('li');
        row.className = isActive ? 'ip-row active' : 'ip-row';

        const dot = document.createElement('span');
        dot.className = 'ip-dot';
        dot.title = isActive ? 'Answering now' : 'Not answering';
        row.appendChild(dot);

        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'settings-input ip-input';
        // 'url' keeps letters available for a hostname; 'decimal' would not
        input.inputMode = 'url';
        input.autocomplete = 'off';
        input.spellcheck = false;
        input.placeholder = '192.168.1.25';
        input.value = ip || '';
        row.appendChild(input);

        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'icon-btn ip-remove';
        remove.title = 'Remove address';
        remove.setAttribute('aria-label', 'Remove address');
        remove.textContent = '×';
        row.appendChild(remove);

        return row;
    }

    /**
     * Append an empty row and put the cursor in it.
     */
    addEmptyIpRow() {
        const list = this.elements.deviceIpList;
        if (!list) return;

        const row = this.buildIpRow('', false);
        list.appendChild(row);
        row.querySelector('.ip-input')?.focus();
    }

    /**
     * Move the "in use" marker without redrawing (which would drop focus).
     * @param {string|null} activeIp
     */
    markActiveIp(activeIp) {
        const rows = this.elements.deviceIpList?.querySelectorAll('.ip-row') || [];

        for (const row of rows) {
            const input = row.querySelector('.ip-input');
            const isActive = !!activeIp && !!input && input.value.trim() === activeIp;
            row.classList.toggle('active', isActive);

            const dot = row.querySelector('.ip-dot');
            if (dot) dot.title = isActive ? 'Answering now' : 'Not answering';
        }
    }

    /**
     * Addresses currently typed in the panel, blanks dropped.
     * @returns {string[]}
     */
    getDeviceIpsFromUI() {
        const inputs = this.elements.deviceIpList?.querySelectorAll('.ip-input') || [];
        return Array.from(inputs).map(input => input.value.trim()).filter(Boolean);
    }

    updateFolderLabel(folderName) {
        if (this.elements.folderLabel) {
            this.elements.folderLabel.textContent = `📁 ${folderName}/`;
        }
    }

    getSettingsFromUI() {
        return {
            firmwareType: this.elements.firmwareTypeSelect.value,
            deviceIps: this.getDeviceIpsFromUI(),
            targetFolder: this.elements.targetFolderInput.value.trim()
        };
    }

    // --- Button States ---

    setConnectButtonState(state) {
        const btn = this.elements.connectBtn;
        const iconSpan = btn.querySelector('.btn-icon');

        btn.className = 'icon-btn'; // reset

        switch (state) {
            case 'loading':
                btn.disabled = true;
                iconSpan.innerHTML = '<div class="btn-spinner"></div>';
                break;
            case 'success':
                btn.disabled = false;
                btn.classList.add('success');
                iconSpan.textContent = '✅';
                setTimeout(() => this.setConnectButtonState('idle'), 2000);
                break;
            case 'error':
                btn.disabled = false;
                btn.classList.add('error');
                iconSpan.textContent = '❌';
                setTimeout(() => this.setConnectButtonState('idle'), 2000);
                break;
            default:
                btn.disabled = false;
                iconSpan.textContent = '🔄';
                break;
        }
    }

    setSendButtonState(state, message = '') {
        const btn = this.elements.sendBtn;
        const iconSpan = btn.querySelector('.btn-icon');
        const textSpan = btn.querySelector('.btn-text');

        btn.classList.remove('success', 'error');

        switch (state) {
            case 'sending':
                this.sendInProgress = true;
                btn.disabled = true;
                iconSpan.innerHTML = '<div class="btn-spinner"></div>';
                textSpan.textContent = 'Sending...';
                break;

            case 'success':
                this.sendInProgress = false;
                btn.disabled = !this.deviceConnected;
                btn.classList.add('success');
                iconSpan.textContent = '✅';
                textSpan.textContent = message || 'Sent!';
                setTimeout(() => this.setSendButtonState('idle'), 3000);
                break;

            case 'error':
                this.sendInProgress = false;
                btn.disabled = !this.deviceConnected;
                btn.classList.add('error');
                iconSpan.textContent = '❌';
                textSpan.textContent = message || 'Failed';
                setTimeout(() => this.setSendButtonState('idle'), 4000);
                break;

            default:
                this.sendInProgress = false;
                btn.disabled = !this.deviceConnected;
                iconSpan.textContent = '📖';
                textSpan.textContent = 'Send to X3';
                break;
        }
    }

    setDownloadButtonState(state, message = '') {
        const btn = this.elements.downloadBtn;
        const iconSpan = btn.querySelector('.btn-icon');
        const textSpan = btn.querySelector('.btn-text');

        switch (state) {
            case 'downloading':
                btn.disabled = true;
                iconSpan.innerHTML = '<div class="btn-spinner"></div>';
                textSpan.textContent = '...';
                break;

            case 'success':
                btn.disabled = false;
                iconSpan.textContent = '✅';
                textSpan.textContent = 'Saved!';
                setTimeout(() => this.setDownloadButtonState('idle'), 2000);
                break;

            case 'error':
                btn.disabled = false;
                iconSpan.textContent = '❌';
                textSpan.textContent = 'Failed';
                setTimeout(() => this.setDownloadButtonState('idle'), 3000);
                break;

            default:
                btn.disabled = false;
                iconSpan.textContent = '📥';
                textSpan.textContent = 'Download';
                break;
        }
    }
}
