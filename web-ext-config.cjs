// The repo carries README material — a 20MB demo.gif among it — that has no
// business inside an installed extension: without this the signed xpi was
// 24MB, nearly all of it images the browser never loads.
module.exports = {
    ignoreFiles: [
        'media/**',
        'tests/**',
        'node_modules/**',
        'web-ext-artifacts/**',
        'package.json',
        'package-lock.json',
        'web-ext-config.cjs',
        'PLAN*.md',
        '.env',
        '.env.example',
        'src/popup/popup.old.js'
    ]
};
