/**
 * UI Manager
 * Handles DOM elements, event listeners, and UI updates
 */
export class UIManager {
    constructor() {
        this.elements = {};
        this.cacheElements();
    }

    cacheElements() {
        this.elements = {
            articleLoading: document.getElementById('article-loading'),
            articleFound: document.getElementById('article-found'),
            articleNotFound: document.getElementById('article-not-found'),
            articleError: document.getElementById('article-error'),
            articleTitle: document.getElementById('article-title'),
            articleAuthor: document.getElementById('article-author'),
            articleWords: document.getElementById('article-words'),
            errorMessage: document.getElementById('error-message'),
            sendBtn: document.getElementById('send-btn'),
            downloadBtn: document.getElementById('download-btn'),
            deviceLoading: document.getElementById('device-loading'),
            deviceConnected: document.getElementById('device-connected'),
            deviceDisconnected: document.getElementById('device-disconnected'),
            deviceFiles: document.getElementById('device-files'),
            fileCount: document.getElementById('file-count'),
            fileListItems: document.getElementById('file-list-items'),
            folderLabel: document.getElementById('folder-label'),
            firmwareTypeSelect: document.getElementById('firmware-type'),
            targetFolderInput: document.getElementById('target-folder'),
            deviceIpContainer: document.getElementById('device-ip-container'),
            deviceIpInput: document.getElementById('device-ip'),
            connectBtn: document.getElementById('connect-btn'),
            settingsHeader: document.getElementById('settings-header'),
            settingsContent: document.getElementById('settings-content'),
            settingsToggleIcon: document.getElementById('settings-toggle-icon'),
            sortSelect: document.getElementById('sort-order')
        };
    }

    setupListeners(handlers) {
        if (handlers.onSend) this.elements.sendBtn.addEventListener('click', handlers.onSend);
        if (handlers.onDownload) this.elements.downloadBtn.addEventListener('click', handlers.onDownload);
        if (handlers.onSettingsChange) this.elements.firmwareTypeSelect.addEventListener('change', handlers.onSettingsChange);
        if (handlers.onIpChange) this.elements.deviceIpInput.addEventListener('change', handlers.onIpChange);
        if (handlers.onTargetFolderChange) this.elements.targetFolderInput.addEventListener('change', handlers.onTargetFolderChange);
        if (handlers.onConnect) this.elements.connectBtn.addEventListener('click', handlers.onConnect);
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

    showArticleNotFound() {
        this.elements.articleLoading.classList.add('hidden');
        this.elements.articleFound.classList.add('hidden');
        this.elements.articleError.classList.add('hidden');
        this.elements.articleNotFound.classList.remove('hidden');
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
        const ipDisplay = this.elements.deviceConnected.querySelector('span:last-child');
        if (ipDisplay) {
            ipDisplay.textContent = `Connected to ${ip}`;
        }
    }

    showDeviceDisconnected() {
        this.elements.deviceLoading.classList.add('hidden');
        this.elements.deviceConnected.classList.add('hidden');
        this.elements.deviceFiles.classList.add('hidden');
        this.elements.deviceDisconnected.classList.remove('hidden');
    }

    showFileList(files, onDelete) {
        this.elements.deviceFiles.classList.remove('hidden');
        this.elements.fileCount.textContent = `${files.length} file${files.length !== 1 ? 's' : ''}`;

        if (files.length === 0) {
            this.elements.fileListItems.innerHTML = '<li class="empty"><span class="file-name">No files yet</span></li>';
        } else {
            // No slicing - show all files (CSS handles scroll)
            this.elements.fileListItems.innerHTML = files
                .map(f => {
                    const escapedName = f.name.replace(/"/g, '&quot;');
                    return `<li data-filename="${escapedName}">
                    <span class="file-name" title="${escapedName}">${f.name}</span>
                    <button class="delete-btn" title="Delete file">🗑️</button>
                </li>`;
                })
                .join('');

            // Add click handlers for delete buttons
            this.elements.fileListItems.querySelectorAll('.delete-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const li = btn.closest('li');
                    const filename = li.dataset.filename;
                    onDelete(filename, li);
                });
            });
        }
    }

    showEmptyFileList() {
        this.elements.deviceFiles.classList.remove('hidden');
        this.elements.fileCount.textContent = '0 files';
        this.elements.fileListItems.innerHTML = '<li class="empty"><span class="file-name">No files yet</span></li>';
    }

    // --- Settings UI ---

    // --- Settings UI ---

    updateSettingsUI(settings) {
        this.elements.firmwareTypeSelect.value = settings.firmwareType;
        this.elements.deviceIpInput.value = settings.deviceIp;
        this.elements.targetFolderInput.value = settings.targetFolder;
        this.updateFolderLabel(settings.targetFolder);
        // Optional: Update placeholder based on firmware type (UX improvement)
        if (settings.firmwareType === 'crosspoint') {
            this.elements.deviceIpInput.placeholder = '192.168.4.1';
        } else {
            this.elements.deviceIpInput.placeholder = '192.168.3.3';
        }
    }

    updateFolderLabel(folderName) {
        if (this.elements.folderLabel) {
            this.elements.folderLabel.textContent = `📁 ${folderName}/`;
        }
    }

    getSettingsFromUI() {
        return {
            firmwareType: this.elements.firmwareTypeSelect.value,
            deviceIp: this.elements.deviceIpInput.value.trim(),
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
                btn.disabled = true;
                iconSpan.innerHTML = '<div class="btn-spinner"></div>';
                textSpan.textContent = 'Sending...';
                break;

            case 'success':
                btn.disabled = false;
                btn.classList.add('success');
                iconSpan.textContent = '✅';
                textSpan.textContent = message || 'Sent!';
                setTimeout(() => this.setSendButtonState('idle'), 3000);
                break;

            case 'error':
                btn.disabled = false;
                btn.classList.add('error');
                iconSpan.textContent = '❌';
                textSpan.textContent = message || 'Failed';
                setTimeout(() => this.setSendButtonState('idle'), 4000);
                break;

            default:
                btn.disabled = false;
                iconSpan.textContent = '📖';
                textSpan.textContent = 'Send to X4';
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
