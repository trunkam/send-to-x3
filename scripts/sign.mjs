/* Signs the extension with the Dropbox app key baked in, without ever writing
   that key into a tracked file.

   The key is not a secret — PKCE has nothing left to hide — but it identifies
   one particular Dropbox app, and this repository is public: committed, it would
   stay in the history forever and every fork would spend our app's quota. So the
   source keeps its empty default, and the key is injected here, into a copy of
   the extension under build/ (git-ignored), which is what gets signed.

   Usage: put DROPBOX_APP_KEY in .env next to the AMO credentials, then
       npm run sign
*/
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
// Outside the repository on purpose: this working copy lives in Dropbox, which
// syncs whatever appears under it and holds the new files open — deleting the
// build directory then fails with EPERM halfway through a signing run.
const buildDir = path.join(os.tmpdir(), 'send-to-x3-build');
const settingsFile = path.join(buildDir, 'src', 'utils', 'settings.js');
const EMPTY_DEFAULT = "DROPBOX_APP_KEY: '',";

// Everything web-ext would leave out anyway, plus the things that only exist
// here: the copy under build/ has to be exactly what ships.
const EXCLUDED = new Set([
    'build', 'node_modules', 'media', 'tests', 'scripts', 'web-ext-artifacts', '.git',
    'package.json', 'package-lock.json', 'web-ext-config.cjs', '.env', '.env.example',
    '.gitignore', '.amo-upload-uuid'
]);

function readEnv() {
    const file = path.join(root, '.env');
    if (!fs.existsSync(file)) throw new Error('.env not found — copy .env.example and fill it in.');

    const values = {};
    for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
        const match = /^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/.exec(line);
        if (match) values[match[1]] = match[2].trim().replace(/^["']|["']$/g, '');
    }
    return values;
}

function copyExtension() {
    fs.rmSync(buildDir, { recursive: true, force: true });
    fs.mkdirSync(buildDir, { recursive: true });

    // Entry by entry: copying the root into a directory inside the root is
    // refused outright, filter or no filter.
    for (const entry of fs.readdirSync(root)) {
        if (EXCLUDED.has(entry) || entry.endsWith('.md')) continue;
        fs.cpSync(path.join(root, entry), path.join(buildDir, entry), {
            recursive: true,
            filter: (source) => !path.relative(root, source).endsWith('.md')
        });
    }
}

function injectAppKey(appKey) {
    const source = fs.readFileSync(settingsFile, 'utf8');
    const occurrences = source.split(EMPTY_DEFAULT).length - 1;
    if (occurrences !== 1) {
        throw new Error(`Expected exactly one "${EMPTY_DEFAULT}" in settings.js, found ${occurrences}. ` +
            'The default moved — fix this script rather than shipping an unkeyed build.');
    }
    fs.writeFileSync(settingsFile, source.replace(EMPTY_DEFAULT, `DROPBOX_APP_KEY: '${appKey}',`));
}

function newestXpi() {
    const dir = path.join(root, 'web-ext-artifacts');
    if (!fs.existsSync(dir)) return null;
    const files = fs.readdirSync(dir)
        .filter(name => name.endsWith('.xpi'))
        .map(name => ({ name, at: fs.statSync(path.join(dir, name)).mtimeMs }))
        .sort((a, b) => b.at - a.at);
    return files.length ? path.join(dir, files[0].name) : null;
}

// --dry-run builds and injects but signs nothing, and leaves build/ to look at.
const dryRun = process.argv.includes('--dry-run');

const env = readEnv();
const appKey = env.DROPBOX_APP_KEY || process.env.DROPBOX_APP_KEY;
if (!appKey) {
    throw new Error('DROPBOX_APP_KEY is missing from .env — the signed build would ask for the key on the phone.');
}
if (!dryRun && (!env.WEB_EXT_API_KEY || !env.WEB_EXT_API_SECRET)) {
    throw new Error('AMO credentials are missing from .env (WEB_EXT_API_KEY / WEB_EXT_API_SECRET).');
}

const { version } = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
const before = newestXpi();

console.log(`Building ${version} with the Dropbox app key in place…`);
copyExtension();
injectAppKey(appKey);

if (dryRun) {
    const line = fs.readFileSync(settingsFile, 'utf8')
        .split('\n').find(candidate => candidate.includes('DROPBOX_APP_KEY:') && !candidate.includes('dropboxAppKey'));
    console.log(`Dry run — nothing signed, nothing sent. build/ kept for inspection.`);
    console.log(`  key in place: ${line.trim().replace(appKey, `${appKey.slice(0, 3)}…(${appKey.length} chars)`)}`);
    process.exit(0);
}

execFileSync('npx', ['web-ext', 'sign', '--source-dir', buildDir, '--channel', 'unlisted',
    '--artifacts-dir', path.join(root, 'web-ext-artifacts')], {
    cwd: root,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: { ...process.env, WEB_EXT_API_KEY: env.WEB_EXT_API_KEY, WEB_EXT_API_SECRET: env.WEB_EXT_API_SECRET }
});

// web-ext has no --filename, and the name it picks is an opaque string that is
// unreadable from the phone inside Dropbox.
const signed = newestXpi();
if (signed && signed !== before) {
    const wanted = path.join(path.dirname(signed), `send-to-x3-${version}.xpi`);
    if (signed !== wanted) {
        fs.renameSync(signed, wanted);
        console.log(`Signed: ${path.relative(root, wanted)}`);
    }
} else {
    console.log('No new .xpi appeared — check the output above.');
}

fs.rmSync(buildDir, { recursive: true, force: true });
