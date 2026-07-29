/* Shared validation for every file sent to an X4. Loaded in popup and worker. */
const TransferUtils = {
    SUPPORTED_TYPES: {
        '.epub': 'application/epub+zip',
        '.txt': 'text/plain',
        '.xtc': 'application/x-xtc'
    },

    extensionFor(filename) {
        const match = /\.[^.]+$/.exec(String(filename || '').toLowerCase());
        return match ? match[0] : '';
    },

    mimeTypeFor(filename) {
        return this.SUPPORTED_TYPES[this.extensionFor(filename)] || null;
    },

    safeFilename(filename) {
        const value = String(filename || '').trim();
        if (!value || value.length > 180 || /[\\/\0]/.test(value) || value === '.' || value === '..') {
            throw new Error('Choose a valid filename without path separators.');
        }
        if (!this.mimeTypeFor(value)) {
            throw new Error('Only EPUB, TXT, and XTC files are supported.');
        }
        return value;
    },

    safeDirectory(directory) {
        const value = String(directory || '').replace(/^\/+|\/+$/g, '');
        if (!value) throw new Error('A destination folder is required.');
        const segments = value.split('/');
        if (segments.some(segment => !segment || segment === '.' || segment === '..' || /[\\\0]/.test(segment))) {
            throw new Error('Choose a valid destination folder.');
        }
        return value;
    },

    dateFolder(date = new Date()) {
        const dateOnly = typeof date === 'string' && /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
        if (dateOnly) {
            const [, year, month, day] = dateOnly;
            const localDate = new Date(Number(year), Number(month) - 1, Number(day));
            if (localDate.getFullYear() === Number(year) && localDate.getMonth() === Number(month) - 1 && localDate.getDate() === Number(day)) {
                return date;
            }
            return null;
        }
        const value = new Date(date);
        if (Number.isNaN(value.getTime())) return null;
        return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
    },

    destination(baseFolder, organizeByDate, date) {
        const base = this.safeDirectory(baseFolder);
        return organizeByDate ? `${base}/${this.dateFolder(date) || this.dateFolder()}` : base;
    },

    collisionFilename(filename, attempt) {
        if (!attempt) return filename;
        const index = filename.lastIndexOf('.');
        const stem = index > 0 ? filename.slice(0, index) : filename;
        const extension = index > 0 ? filename.slice(index) : '';
        return `${stem} (${attempt + 1})${extension}`;
    },

    isConnectivityError(error) {
        const message = String(error || '').toLowerCase();
        return message.includes('cannot reach') ||
            message.includes('failed to fetch') ||
            message.includes('network request failed') ||
            message.includes('networkerror') ||
            message.includes('timed out') ||
            message.includes('timeout');
    }
};

if (typeof window !== 'undefined') window.TransferUtils = TransferUtils;
else self.TransferUtils = TransferUtils;
