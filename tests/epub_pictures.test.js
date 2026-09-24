const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

// The classic scripts share one scope in the extension; here each installs its global.
require('../src/utils/sanitize.js');
require('../src/epub/epub_templates.js');
globalThis.JSZip = require('../src/epub/jszip.min.js');
const EpubBuilder = require('../src/epub/epub_builder.js');

// Two tiny made-up pictures: the bytes only have to survive the trip.
const X3_BYTES = Buffer.from('x3-picture');
const KINDLE_BYTES = Buffer.from('kindle-picture, larger');

const article = {
    title: 'Retail sales',
    author: 'Greg Ip',
    date: '2026-09-24',
    url: 'https://www.wsj.com/x',
    body: '<p>Before.</p><figure><img src="x3img:0" alt="Nothing to be proud of"/></figure><p>Between.</p><img src="https://images.wsj.net/remote.jpg"><div class="x3-image"><img src="x3img:1" alt=""/></div><p>After.</p>',
    images: [
        { alt: 'Nothing to be proud of', x3: { type: 'image/png', base64: X3_BYTES.toString('base64') }, kindle: { type: 'image/png', base64: KINDLE_BYTES.toString('base64') } },
        { alt: '', x3: { type: 'image/jpeg', base64: X3_BYTES.toString('base64') }, kindle: { type: 'image/jpeg', base64: KINDLE_BYTES.toString('base64') } }
    ]
};

async function open(variant) {
    const blob = await EpubBuilder.build(article, { variant });
    return JSZip.loadAsync(await blob.arrayBuffer());
}

describe('EpubBuilder with pictures', () => {
    it('puts the X3 version of each picture in the X3 EPUB', async () => {
        const zip = await open('x3');
        assert.deepEqual(await zip.file('OEBPS/images/img-0.png').async('nodebuffer'), X3_BYTES);
        assert.deepEqual(await zip.file('OEBPS/images/img-1.jpg').async('nodebuffer'), X3_BYTES);
    });

    it('puts the Kindle version in the Kindle EPUB', async () => {
        const zip = await open('kindle');
        assert.deepEqual(await zip.file('OEBPS/images/img-0.png').async('nodebuffer'), KINDLE_BYTES);
    });

    it('is the X3 EPUB when nobody says which', async () => {
        const blob = await EpubBuilder.build(article);
        const zip = await JSZip.loadAsync(await blob.arrayBuffer());
        assert.deepEqual(await zip.file('OEBPS/images/img-0.png').async('nodebuffer'), X3_BYTES);
    });

    it('lists every picture in the manifest with its type', async () => {
        const opf = await (await open('x3')).file('OEBPS/content.opf').async('string');
        assert.ok(opf.includes('<item id="img0" href="images/img-0.png" media-type="image/png"/>'));
        assert.ok(opf.includes('<item id="img1" href="images/img-1.jpg" media-type="image/jpeg"/>'));
    });

    it('points the page at the files and drops the picture left on the internet', async () => {
        const xhtml = await (await open('x3')).file('OEBPS/content.xhtml').async('string');
        assert.ok(xhtml.includes('<img src="images/img-0.png" alt="Nothing to be proud of" />') ||
            xhtml.includes('<img src="images/img-0.png" alt="Nothing to be proud of"/>'), xhtml);
        assert.ok(xhtml.includes('images/img-1.jpg'));
        assert.ok(!xhtml.includes('images.wsj.net'));
        assert.ok(!xhtml.includes('x3img:'));
    });

    it('builds an article with no pictures as before', async () => {
        const blob = await EpubBuilder.build({ ...article, body: '<p>Only text.</p>', images: undefined });
        const zip = await JSZip.loadAsync(await blob.arrayBuffer());
        assert.equal(Object.keys(zip.files).some(name => name.includes('images/')), false);
    });
});

describe('EpubBuilder.resolvePictures', () => {
    it('drops a reference whose picture has no version for this reader', () => {
        const pictures = EpubBuilder.pictureFiles({ images: [{ alt: '', x3: { type: 'image/png', base64: 'AA==' } }] }, 'kindle');
        assert.equal(EpubBuilder.resolvePictures('<p>a</p><img src="x3img:0"/>', pictures), '<p>a</p>');
    });
});
