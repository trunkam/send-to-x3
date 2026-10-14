const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const zlib = require('node:zlib');
const ArticleImages = require('../src/utils/article_images.js');

describe('ArticleImages.findImages', () => {
    it('finds every picture with its source and alternative text, in order', () => {
        const body = '<p>a</p><img src="https://x.com/a.jpg?w=1&amp;h=2" alt="A &amp; B"><figure><img alt=\'c\' src=\'x3-chart:0\'/></figure>';
        const found = ArticleImages.findImages(body);
        assert.deepEqual(found.map(image => [image.src, image.alt]), [
            ['https://x.com/a.jpg?w=1&h=2', 'A & B'],
            ['x3-chart:0', 'c']
        ]);
    });

    it('is not fooled by a ">" inside an attribute', () => {
        const [image] = ArticleImages.findImages('<img alt="1 > 0" src="a.png"><p>after</p>');
        assert.equal(image.src, 'a.png');
        assert.equal(image.tag, '<img alt="1 > 0" src="a.png">');
    });
});

describe('ArticleImages.rewrite', () => {
    it('replaces each picture with its own replacement, and drops the empty ones', () => {
        const body = '<p>a</p><img src="1"><p>b</p><img src="2"><p>c</p>';
        const found = ArticleImages.findImages(body);
        assert.equal(ArticleImages.rewrite(body, found, ['<img src="x3img:0"/>', '']),
            '<p>a</p><img src="x3img:0"/><p>b</p><p>c</p>');
    });
});

describe('ArticleImages.markerIndex', () => {
    it('reads the stand-in the fallback leaves where a picture was', () => {
        assert.equal(ArticleImages.markerIndex(ArticleImages.marker(7)), 7);
        assert.equal(ArticleImages.markerIndex(' [[x3-image:3]] '), 3);
        assert.equal(ArticleImages.markerIndex('text [[x3-image:3]]'), null);
    });
});

describe('ArticleImages.resolveSource', () => {
    const article = {
        charts: [{ dataUrl: 'data:image/png;base64,AAA', alt: 'Retail sales' }],
        imageSources: [{ src: 'x3-chart:0', alt: '' }, { src: 'https://x.com/p.jpg', alt: 'photo' }]
    };

    it('takes a chart from what the page made of it', () => {
        assert.deepEqual(ArticleImages.resolveSource(article, { src: 'x3-chart:0', alt: '' }),
            { src: 'data:image/png;base64,AAA', alt: 'Retail sales', chart: true });
    });

    it('follows a fallback marker to a chart or to an address', () => {
        assert.equal(ArticleImages.resolveSource(article, { src: 'x3-image:0', alt: '' }).chart, true);
        assert.deepEqual(ArticleImages.resolveSource(article, { src: 'x3-image:1', alt: '' }),
            { src: 'https://x.com/p.jpg', alt: 'photo', chart: false });
    });

    it('gives up on what it cannot fetch', () => {
        assert.equal(ArticleImages.resolveSource(article, { src: 'x3-chart:9', alt: '' }), null);
        assert.equal(ArticleImages.resolveSource(article, { src: '/relative.png', alt: '' }), null);
    });
});

describe('ArticleImages.targetSize', () => {
    it('fits a wide picture to each reader', () => {
        assert.deepEqual(ArticleImages.targetSize(1200, 800, ArticleImages.X3_WIDTH), { width: 480, height: 320 });
        assert.deepEqual(ArticleImages.targetSize(1200, 800, ArticleImages.KINDLE_WIDTH), { width: 1000, height: 667 });
    });

    it('never enlarges a small picture', () => {
        assert.deepEqual(ArticleImages.targetSize(300, 200, ArticleImages.KINDLE_WIDTH), { width: 300, height: 200 });
    });

    it('cuts a very tall picture down to three widths', () => {
        const size = ArticleImages.targetSize(1000, 10000, ArticleImages.X3_WIDTH);
        assert.equal(size.height, 480 * 3);
        assert.equal(size.width, 144);
    });
});

describe('ArticleImages.toGray', () => {
    it('weighs the channels as the eye does and lays transparency on white', () => {
        const rgba = new Uint8Array([255, 0, 0, 255, 0, 0, 0, 0, 0, 0, 0, 255]);
        assert.deepEqual([...ArticleImages.toGray(rgba)], [76, 255, 0]);
    });
});

describe('ArticleImages.encodeGrayPng', () => {
    const deflate = async bytes => new Uint8Array(zlib.deflateSync(bytes));

    it('writes a gray PNG whose pixels come back as they went in', async () => {
        const width = 3, height = 2;
        const gray = new Uint8Array([0, 128, 255, 10, 20, 30]);
        const png = await ArticleImages.encodeGrayPng(gray, width, height, deflate);

        assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
        const view = new DataView(png.buffer);
        assert.equal(Buffer.from(png.subarray(12, 16)).toString('latin1'), 'IHDR');
        assert.equal(view.getUint32(16), width);
        assert.equal(view.getUint32(20), height);
        assert.equal(png[24], 8);
        assert.equal(png[25], 0);

        const idatLength = view.getUint32(33);
        assert.equal(Buffer.from(png.subarray(37, 41)).toString('latin1'), 'IDAT');
        const raw = zlib.inflateSync(png.subarray(41, 41 + idatLength));
        assert.deepEqual([...raw], [0, 0, 128, 255, 0, 10, 20, 30]);
        assert.equal(Buffer.from(png.subarray(png.length - 8, png.length - 4)).toString('latin1'), 'IEND');
    });

    it('carries a correct checksum on every chunk', async () => {
        const png = await ArticleImages.encodeGrayPng(new Uint8Array(4), 2, 2, deflate);
        let offset = 8;
        while (offset < png.length) {
            const view = new DataView(png.buffer, png.byteOffset);
            const length = view.getUint32(offset);
            const crc = view.getUint32(offset + 8 + length);
            assert.equal(crc, ArticleImages.crc32(png.subarray(offset + 4, offset + 8 + length)));
            offset += 12 + length;
        }
        assert.equal(offset, png.length);
    });

    it('compresses with the platform when nothing is passed in', async () => {
        const png = await ArticleImages.encodeGrayPng(new Uint8Array(4).fill(200), 2, 2);
        const view = new DataView(png.buffer);
        const raw = zlib.inflateSync(png.subarray(41, 41 + view.getUint32(33)));
        assert.deepEqual([...raw], [0, 200, 200, 0, 200, 200]);
    });
});

describe('ArticleImages.wantsPng', () => {
    it('keeps charts and published PNGs sharp, and photographs small', () => {
        assert.equal(ArticleImages.wantsPng('image/jpeg', true), true);
        assert.equal(ArticleImages.wantsPng('image/png', false), true);
        assert.equal(ArticleImages.wantsPng('image/gif', false), true);
        assert.equal(ArticleImages.wantsPng('image/webp', false), false);
        assert.equal(ArticleImages.wantsPng('image/jpeg', false), false);
    });
});

describe('ArticleImages.prepare', () => {
    it('takes out a picture it cannot fetch, and counts it', async () => {
        const article = { body: '<p>a</p><img src="https://x.com/gone.jpg"><p>b</p>' };
        const fetchImpl = async () => ({ ok: false, status: 404 });
        const { article: prepared, added, failed } = await ArticleImages.prepare(article, { fetchImpl });
        assert.equal(prepared.body, '<p>a</p><p>b</p>');
        assert.equal(added, 0);
        assert.equal(failed, 1);
    });

    it('leaves a picture already prepared as it is', async () => {
        const article = { body: '<img src="x3img:0" alt="a"/>', images: [{ alt: 'a', x3: {}, kindle: {} }] };
        const { article: prepared, added, failed } = await ArticleImages.prepare(article, { fetchImpl: async () => { throw new Error('no fetch'); } });
        assert.equal(prepared.body, article.body);
        assert.equal(prepared.images.length, 1);
        assert.equal(added + failed, 0);
    });

    it('drops what the page made but no longer needs', async () => {
        const article = { body: '<p>a</p>', charts: [{ dataUrl: 'data:' }], imageSources: [] };
        const { article: prepared } = await ArticleImages.prepare(article);
        assert.equal('charts' in prepared, false);
        assert.equal('imageSources' in prepared, false);
    });
});

describe('ArticleImages.placeMissingCharts', () => {
    // The WSJ of 14/10: the chart opens the piece, above the body Readability keeps.
    const LEAD = 'Inflation picked up in September, a sign that high energy prices are tightening their squeeze on consumers';
    const body = `<div><p>${LEAD} ahead of next month’s midterm elections.</p><h3>The numbers:</h3><p>Consumer prices were up 3.7% in September from a year earlier, the Labor Department said.</p></div>`;

    it('puts a chart Readability dropped before the paragraph that followed it in the page', () => {
        const placed = ArticleImages.placeMissingCharts({
            body,
            charts: [{ alt: 'Consumer-price index', before: LEAD.slice(0, 80), after: [] }]
        });
        assert.ok(placed.startsWith('<div><figure><img src="x3-chart:0" alt="Consumer-price index"/></figure><p>Inflation'));
    });

    it('matches the paragraph whatever quotes and entities either side spells it with', () => {
        const placed = ArticleImages.placeMissingCharts({
            body: '<p>It&#8217;s the &quot;core&quot; rate that matters to the Fed here, said the economists.</p>',
            charts: [{ alt: '', before: 'It’s the “core” rate that matters' }]
        });
        assert.ok(placed.startsWith('<figure><img src="x3-chart:0" alt=""/></figure><p>'));
    });

    it('falls back to after the nearest paragraph above it, then to the end', () => {
        const placed = ArticleImages.placeMissingCharts({
            body,
            charts: [
                { alt: 'a', before: 'Not in the article any more', after: ['Gone too', 'Consumer prices were up 3.7%'] },
                { alt: 'b', before: '', after: [] }
            ]
        });
        assert.ok(placed.includes('a year earlier, the Labor Department said.</p><figure><img src="x3-chart:0" alt="a"/></figure>'));
        assert.ok(placed.endsWith('\n<figure><img src="x3-chart:1" alt="b"/></figure>'));
    });

    it('leaves alone a chart already in place, on either road', () => {
        const readability = `<p>x</p><figure><img src="x3-chart:0" alt=""/></figure>`;
        assert.equal(ArticleImages.placeMissingCharts({ body: readability, charts: [{ alt: '', before: 'x' }] }), readability);
        const fallback = '<div class="x3-image"><img src="x3-image:2" alt=""/></div>';
        assert.equal(ArticleImages.placeMissingCharts({
            body: fallback,
            charts: [{ alt: '', before: '' }],
            imageSources: [{ src: 'https://a/1.jpg' }, { src: 'https://a/2.jpg' }, { src: 'x3-chart:0' }]
        }), fallback);
    });

    it('keeps two charts that open the piece in their order', () => {
        const placed = ArticleImages.placeMissingCharts({
            body,
            charts: [{ alt: 'first', before: LEAD }, { alt: 'second', before: LEAD }]
        });
        assert.ok(placed.indexOf('alt="first"') < placed.indexOf('alt="second"'));
        assert.ok(placed.indexOf('alt="second"') < placed.indexOf('<p>Inflation'));
    });

    it('changes nothing when the page made no charts', () => {
        assert.equal(ArticleImages.placeMissingCharts({ body }), body);
    });
});
