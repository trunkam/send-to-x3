/* Talks to the Dropbox API so the extension can pick up what the iPad Shortcut
   and the PC drop in the shared folder, without the user hunting for files in
   Android's picker.

   Why the API and not the folder: no WebExtension API can read a directory off
   disk. `downloads` only writes, `storage` holds extension data, and
   showDirectoryPicker() is Chrome-only. Reaching Dropbox over the network is the
   only door, and an extension with host permissions is not subject to CORS.

   Auth is PKCE: Dropbox dropped long-lived tokens in 2021, and an app secret
   shipped inside an extension would be public anyway. The refresh token is
   obtained once and then swapped for a short-lived access token on every run.

   This module holds no state: tokens and folder come in as arguments, so it
   stays testable under Node. Settings does the storing. */
const DropboxClient = {
    AUTH_URL: 'https://www.dropbox.com/oauth2/authorize',
    TOKEN_URL: 'https://api.dropboxapi.com/oauth2/token',
    API_URL: 'https://api.dropboxapi.com/2',
    CONTENT_URL: 'https://content.dropboxapi.com/2',

    // Files we know how to turn into an article. Anything else in the folder is
    // left alone rather than moved away, so a stray file stays visible.
    EXTENSIONS: ['.html', '.htm', '.epub'],

    isSupported(filename) {
        const value = String(filename || '').toLowerCase();
        return this.EXTENSIONS.some(extension => value.endsWith(extension));
    },

    // --- PKCE ---------------------------------------------------------------

    base64url(bytes) {
        let binary = '';
        for (const byte of new Uint8Array(bytes)) binary += String.fromCharCode(byte);
        return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    },

    createVerifier() {
        const bytes = new Uint8Array(64);
        crypto.getRandomValues(bytes);
        return this.base64url(bytes);
    },

    async challengeFor(verifier) {
        const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
        return this.base64url(digest);
    },

    /* No redirect_uri on purpose: Dropbox then shows the code on screen for the
       user to copy. On Firefox Android there is no reliable way back into the
       extension from a redirect, and this costs one paste, once. */
    async authorizeUrl(appKey, verifier) {
        const params = new URLSearchParams({
            client_id: appKey,
            response_type: 'code',
            code_challenge: await this.challengeFor(verifier),
            code_challenge_method: 'S256',
            token_access_type: 'offline'
        });
        return this.AUTH_URL + '?' + params;
    },

    async postForm(url, fields) {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams(fields)
        });
        const text = await response.text();
        if (!response.ok) throw new Error(this.describeError(response.status, text));
        return JSON.parse(text);
    },

    // One-time: turn the pasted code into the refresh token we keep.
    async exchangeCode(appKey, code, verifier) {
        const data = await this.postForm(this.TOKEN_URL, {
            code: String(code || '').trim(),
            grant_type: 'authorization_code',
            client_id: appKey,
            code_verifier: verifier
        });
        if (!data.refresh_token) {
            throw new Error('Dropbox did not return a refresh token. Make sure the app requests offline access.');
        }
        return data.refresh_token;
    },

    // Every run: short-lived access token, ~4 hours, not worth storing.
    async accessTokenFrom(appKey, refreshToken) {
        const data = await this.postForm(this.TOKEN_URL, {
            grant_type: 'refresh_token',
            refresh_token: refreshToken,
            client_id: appKey
        });
        return data.access_token;
    },

    // --- API ----------------------------------------------------------------

    /* Dropbox-API-Arg travels in a header, and headers are ASCII. Real filenames
       here carry typographic apostrophes, so anything above 0x7e has to go out
       as a \uXXXX escape or the request is rejected. */
    asciiJson(value) {
        let escaped = '';
        for (const character of JSON.stringify(value)) {
            const code = character.charCodeAt(0);
            escaped += code > 126 ? '\\u' + code.toString(16).padStart(4, '0') : character;
        }
        return escaped;
    },

    describeError(status, body) {
        const text = String(body || '').slice(0, 300);
        if (status === 401) return 'Dropbox rejected the token. Re-authorise the extension.';
        if (status === 409) return 'Dropbox could not find that path: ' + text;
        return 'Dropbox error ' + status + ': ' + text;
    },

    async callApi(token, endpoint, body) {
        const response = await fetch(this.API_URL + '/' + endpoint, {
            method: 'POST',
            headers: {
                'Authorization': 'Bearer ' + token,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(body)
        });
        const text = await response.text();
        if (!response.ok) throw new Error(this.describeError(response.status, text));
        return text ? JSON.parse(text) : {};
    },

    /* Lists the folder, oldest first. Only files we can convert are returned and
       sub-folders are skipped: the "sent" folder lives inside this one, and
       recursing would pick the same files up again forever. */
    async list(token, folder) {
        const path = this.normalizeFolder(folder);
        let data = await this.callApi(token, 'files/list_folder', { path, recursive: false });
        const entries = [...data.entries];
        // A folder grown past one page still has to come back whole, otherwise
        // the oldest articles would never be sent.
        while (data.has_more) {
            data = await this.callApi(token, 'files/list_folder/continue', { cursor: data.cursor });
            entries.push(...data.entries);
        }
        return entries
            .filter(entry => entry['.tag'] === 'file' && this.isSupported(entry.name))
            .map(entry => ({
                name: entry.name,
                path: entry.path_lower,
                displayPath: entry.path_display,
                size: entry.size,
                modified: Date.parse(entry.client_modified || entry.server_modified) || Date.now()
            }))
            .sort((a, b) => a.modified - b.modified);
    },

    async download(token, path) {
        const response = await fetch(this.CONTENT_URL + '/files/download', {
            method: 'POST',
            headers: {
                'Authorization': 'Bearer ' + token,
                'Dropbox-API-Arg': this.asciiJson({ path })
            }
        });
        if (!response.ok) {
            throw new Error(this.describeError(response.status, await response.text()));
        }
        return response.blob();
    },

    /* Moved, not deleted: a file that failed to convert stays recoverable by
       hand, and the folder still reads as "what is left to send". */
    async moveToSent(token, file, folder, sentFolder) {
        const base = this.normalizeFolder(folder);
        const target = base + '/' + this.normalizeName(sentFolder) + '/' + file.name;
        return this.callApi(token, 'files/move_v2', {
            from_path: file.path,
            to_path: target,
            autorename: true
        });
    },

    // "AAA", "/AAA" and "AAA/" all mean the same folder to a person.
    normalizeFolder(folder) {
        const cleaned = String(folder || '').trim().replace(/^\/+|\/+$/g, '');
        return cleaned ? '/' + cleaned : '';
    },

    normalizeName(name) {
        return String(name || '').trim().replace(/^\/+|\/+$/g, '') || 'sent';
    }
};

// Expose for classic scripts, ES modules (globalThis), and Node tests (CommonJS)
globalThis.DropboxClient = DropboxClient;
if (typeof module !== 'undefined' && module.exports) {
    module.exports = DropboxClient;
}
