/**
 * Article extraction logic
 * This function is stringified and injected into the page, so it must be self-contained.
 */
// Note: This function is stringified, so no imports allowed!
export async function extractArticle() {
    try {
        console.log('[X4] Extracting article...');
        const hostname = window.location.hostname;

        // --- TWITTER / X SUPPORT ---
        if (hostname.includes('twitter.com') || hostname.includes('x.com')) {
            console.log('[X4] Detected Twitter/X');

            // 1. Identify Author from URL
            const urlParts = new URL(window.location.href).pathname.split('/');
            const authorHandle = urlParts[1]; // /username/status/...

            if (!authorHandle || !window.location.href.includes('/status/')) {
                // Fallback to Readability if not a specific thread/status
                console.log('[X4] Not a thread URL, using standard extraction');
            } else {
                console.log('[X4] Extracting Thread for:', authorHandle);

                // Select tweets
                const tweets = Array.from(document.querySelectorAll('article[data-testid="tweet"]'));
                let threadContent = [];
                let title = '';
                let firstTweetFound = false;

                console.log('[X4] Found tweets:', tweets.length);

                tweets.forEach((tweet, index) => {
                    // Check author via User-Name links
                    const userLinks = tweet.querySelectorAll('div[data-testid="User-Name"] a');
                    let isAuthor = false;
                    let debugLinks = [];

                    for (const link of userLinks) {
                        const href = link.getAttribute('href');
                        debugLinks.push(href);
                        if (href && href.replace('/', '').toLowerCase() === authorHandle.toLowerCase()) {
                            isAuthor = true;
                            break;
                        }
                    }

                    // console.log(`[X4] Tweet ${index} author check:`, isAuthor, debugLinks);

                    // Simple Thread Logic: Capture Author's tweets
                    if (isAuthor) {
                        // Extract Text
                        let textEl = tweet.querySelector('[data-testid="tweetText"]');
                        let isArticle = false;

                        // Fallback for Twitter Articles (Long Posts)
                        if (!textEl) {
                            textEl = tweet.querySelector('[data-testid="twitterArticleRichTextView"]');
                            isArticle = !!textEl;
                        }

                        const text = textEl ? textEl.innerHTML : '';
                        console.log(`[X4] Tweet ${index} text length:`, text.length);

                        // Extract Images
                        // const photoEls = tweet.querySelectorAll('[data-testid="tweetPhoto"] img');
                        // const photoUrls = Array.from(photoEls).map(img => img.src);

                        // Title logic
                        // For Articles, prefer the explicit article title
                        if (isArticle) {
                            const articleTitleEl = tweet.querySelector('[data-testid="twitter-article-title"]');
                            if (articleTitleEl) {
                                title = articleTitleEl.textContent.trim();
                            }
                        }
                        // Standard fallback
                        if (!title && textEl) {
                            title = textEl.textContent.substring(0, 50) + '...';
                        }

                        // Helper for XML escaping
                        const escapeXml = (str) => {
                            if (!str) return '';
                            return str.toString()
                                .replace(/&/g, '&amp;')
                                .replace(/</g, '&lt;')
                                .replace(/>/g, '&gt;')
                                .replace(/"/g, '&quot;')
                                .replace(/'/g, '&apos;');
                        };

                        let tweetHtml = `<div class="tweet" style="border-bottom: 1px solid #ccc; padding: 10px 0;">`;
                        if (isArticle && title) {
                            tweetHtml += `<h2>${escapeXml(title)}</h2>`;
                        }
                        if (text) tweetHtml += `<div>${text}</div>`; // Articles often have complex HTML structure, so use div

                        // Images disabled for X4 compatibility
                        /*
                        photoUrls.forEach(url => {
                            tweetHtml += `<img src="${escapeXml(url)}" style="max-width: 100%; margin: 10px 0; border-radius: 8px;" />`;
                        });
                        */
                        tweetHtml += `</div>`;

                        threadContent.push(tweetHtml);
                    }
                });
                console.log('[X4] Thread content items:', threadContent.length);

                if (threadContent.length > 0) {
                    const finalTitle = `${authorHandle} on X: "${title.replace(/"/g, "'")}"`;
                    // Date from first time element
                    const dateEl = document.querySelector('time');
                    const date = dateEl ? dateEl.getAttribute('datetime').split('T')[0] : new Date().toISOString().split('T')[0];

                    // Use first image found as cover
                    // We can look at the first tweet's photos
                    let coverUrl = null;
                    /*
                    // Cover disabled for X4 compatibility
                    const firstTweetPhotos = tweets[0].querySelectorAll('[data-testid="tweetPhoto"] img');
                    if (firstTweetPhotos.length > 0) {
                        coverUrl = firstTweetPhotos[0].src;
                    }
                    */

                    return {
                        success: true,
                        article: {
                            title: finalTitle,
                            author: `X (${authorHandle})`,
                            date,
                            coverUrl,
                            wordCount: threadContent.length * 30,
                            body: threadContent.join('\n'),
                            rawText: '',
                            sourceUrl: window.location.href
                        }
                    };
                }
            }
        }

        // --- STANDARD READABILITY ---
        // Check if Readability is available
        const hasReadability = typeof Readability !== 'undefined';
        console.log('[X4] Readability available:', hasReadability);

        // --- CHARTS ---
        // A chart drawn as SVG - Highcharts on the WSJ - is a picture only on
        // screen: the X3 reads no SVG, and the chart's colours live in the
        // site's stylesheet, not in the drawing. So it is turned into a PNG
        // here, the one place where those styles can still be read, and its
        // place in the page is marked for whichever road the article takes
        // below. The marks come off again in the finally at the bottom.
        const charts = [];
        let chartsFailed = 0;

        // What the page holds that could be a chart, measured as the capture
        // below sees it. On the phone a WSJ chart came out "No pictures" while
        // the same page on the PC gave one: the popup shows this, since the
        // phone has no console to ask what its page looked like.
        const drawings = {};
        try {
            const size = (element) => {
                const box = element.getBoundingClientRect();
                return [Math.round(box.width), Math.round(box.height)];
            };
            const largest = (elements, count) => elements.map(size)
                .sort((a, b) => b[0] * b[1] - a[0] * a[1]).slice(0, count);
            drawings.viewport = Math.round(window.innerWidth);
            drawings.visibility = document.visibilityState;
            drawings.svgs = largest([...document.querySelectorAll('svg')]
                .filter(svg => !(svg.parentElement && svg.parentElement.closest('svg'))), 3);
            drawings.canvases = largest([...document.querySelectorAll('canvas')], 2);
            drawings.highcharts = largest([...document.querySelectorAll('.highcharts-container')], 2);
            drawings.images = [...document.querySelectorAll('img')]
                .filter(picture => picture.getBoundingClientRect().width >= 200).length;
        } catch (error) {
            drawings.error = error.message;
        }

        try {
            const STYLE_PROPERTIES = ['fill', 'fill-opacity', 'stroke', 'stroke-width', 'stroke-opacity',
                'stroke-dasharray', 'stroke-linecap', 'opacity', 'font-family', 'font-size', 'font-weight',
                'font-style', 'text-anchor', 'dominant-baseline', 'visibility', 'display'];
            const layers = [...document.querySelectorAll('svg')].filter((svg) => {
                if (svg.parentElement && svg.parentElement.closest('svg')) return false;
                if (svg.closest('nav, header, footer, aside, button, a')) return false;
                const box = svg.getBoundingClientRect();
                return box.width >= 300 && box.height >= 150;
            });

            // Highcharts draws one chart on two stacked SVGs, titles on one and
            // bars on the other: layers that mostly cover each other are one chart.
            const groups = [];
            for (const svg of layers) {
                const box = svg.getBoundingClientRect();
                const group = groups.find((candidate) => {
                    const w = Math.min(candidate.right, box.right) - Math.max(candidate.left, box.left);
                    const h = Math.min(candidate.bottom, box.bottom) - Math.max(candidate.top, box.top);
                    const smaller = Math.min(box.width * box.height, (candidate.right - candidate.left) * (candidate.bottom - candidate.top));
                    return w > 0 && h > 0 && w * h >= smaller * 0.5;
                });
                if (group) {
                    group.svgs.push(svg);
                    group.left = Math.min(group.left, box.left);
                    group.top = Math.min(group.top, box.top);
                    group.right = Math.max(group.right, box.right);
                    group.bottom = Math.max(group.bottom, box.bottom);
                } else {
                    groups.push({ svgs: [svg], left: box.left, top: box.top, right: box.right, bottom: box.bottom });
                }
            }

            // The drawing with its computed styles written into it, so it looks
            // the same once taken away from the page's stylesheet.
            const standalone = (svg, box) => {
                const copy = svg.cloneNode(true);
                const originals = [svg, ...svg.querySelectorAll('*')];
                const copies = [copy, ...copy.querySelectorAll('*')];
                originals.forEach((element, i) => {
                    const computed = getComputedStyle(element);
                    copies[i].setAttribute('style', STYLE_PROPERTIES.map(p => `${p}:${computed.getPropertyValue(p)}`).join(';'));
                });
                copy.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
                copy.setAttribute('width', box.width);
                copy.setAttribute('height', box.height);
                return new XMLSerializer().serializeToString(copy);
            };

            const ancestors = (element) => {
                const list = [];
                for (let e = element; e; e = e.parentElement) list.push(e);
                return list;
            };

            // The prose around each chart, so the popup can put the chart back
            // when the road below drops its place: Readability keeps the
            // article's body, and a chart opening the piece sits above it.
            const textOf = (element) => (element.textContent || '').replace(/\s+/g, ' ').trim();
            const prose = [...document.querySelectorAll('p')].filter(p => textOf(p).length >= 40);
            const surroundings = (holder) => {
                const next = prose.find(p => !holder.contains(p) &&
                    (holder.compareDocumentPosition(p) & Node.DOCUMENT_POSITION_FOLLOWING));
                const previous = prose.filter(p => !holder.contains(p) &&
                    (holder.compareDocumentPosition(p) & Node.DOCUMENT_POSITION_PRECEDING));
                return {
                    before: next ? textOf(next).slice(0, 80) : '',
                    after: previous.slice(-3).reverse().map(p => textOf(p).slice(0, 80))
                };
            };

            for (const group of groups.slice(0, 15)) {
                try {
                    const width = group.right - group.left;
                    const height = group.bottom - group.top;
                    // Wide enough for the Kindle's version; the X3's is cut from it.
                    const scale = Math.min(1000 / width, 3);
                    const canvas = document.createElement('canvas');
                    canvas.width = Math.round(width * scale);
                    canvas.height = Math.round(height * scale);
                    const context = canvas.getContext('2d');
                    context.fillStyle = '#fff';
                    context.fillRect(0, 0, canvas.width, canvas.height);
                    for (const svg of group.svgs) {
                        const box = svg.getBoundingClientRect();
                        const layer = new Image();
                        layer.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(standalone(svg, box));
                        await layer.decode();
                        context.drawImage(layer, (box.left - group.left) * scale, (box.top - group.top) * scale,
                            box.width * scale, box.height * scale);
                    }
                    const dataUrl = canvas.toDataURL('image/png');

                    // The chart's place: the element holding all its layers,
                    // unless that element holds the article's prose too.
                    let holder = group.svgs[0];
                    for (const svg of group.svgs.slice(1)) {
                        const theirs = ancestors(svg);
                        holder = ancestors(holder).find(a => theirs.includes(a)) || holder;
                    }
                    if (holder.querySelectorAll('p').length > 2) holder = group.svgs[0];

                    // The title can sit on any layer, under Highcharts' name or the
                    // site's own (the WSJ's is "charts-headline").
                    const titled = group.svgs.map(svg => svg.querySelector('.highcharts-title, [class*="headline"], title'))
                        .find(title => title && title.textContent.trim());
                    const alt = (titled?.textContent || group.svgs[0].getAttribute('aria-label') || 'Chart').trim();
                    holder.setAttribute('data-x3-chart', String(charts.length));
                    charts.push({ dataUrl, alt, ...surroundings(holder) });
                } catch (error) {
                    chartsFailed++;
                    console.warn('[X4] Chart not captured:', error.message);
                }
            }

            // A picture shown as the background of an empty box. On the
            // phone the WSJ does not draw its charts: it shows a ready-made
            // PNG as the CSS background of an empty <div> ("chartsFacade"),
            // which is neither an <svg> nor an <img>. Measured on the 14/10
            // page in Firefox for Android, the only other background picture
            // was the masthead logo, inside a link and outside the article -
            // so: empty, chart-sized, inside the article, not in the page's
            // furniture. The address is kept as it is; the popup downloads it.
            const articleArea = document.querySelector('article, main, [role="main"]') || document.body;
            for (const box of articleArea.querySelectorAll('*')) {
                if (charts.length >= 15) break;
                if (box.children.length || box.textContent.trim()) continue;
                if (box.closest('nav, header, footer, aside, button, a, [data-x3-chart]')) continue;
                const area = box.getBoundingClientRect();
                if (area.width < 250 || area.height < 150) continue;
                const picture = /url\(["']?(https?:[^"')]+)["']?\)/.exec(getComputedStyle(box).backgroundImage || '');
                if (!picture) continue;
                box.setAttribute('data-x3-chart', String(charts.length));
                charts.push({
                    src: picture[1],
                    alt: (box.getAttribute('aria-label') || box.getAttribute('title') || '').trim(),
                    ...surroundings(box)
                });
            }
        } catch (error) {
            console.warn('[X4] Chart search failed:', error.message);
        }

        // A newsletter opened in the browser is an HTML email: it can have an
        // empty <title> and no og:title, with the title written only in the page's
        // own <h1>. Readability already falls back to that heading, but the
        // fallback path below has to do it for itself or it names the file after
        // an empty string.
        //
        // The last resort is the hostname, which names nothing: it is reported as
        // such in titleSource, so the queue can offer to rename the article
        // instead of sending it called "links.newsletter.rcsmediagroup.it".
        const pageTitle = () => {
            const fromMeta = document.querySelector('meta[property="og:title"]')?.content ||
                document.querySelector('meta[name="twitter:title"]')?.content || '';
            const fromHeading = document.querySelector('h1')?.textContent || '';
            const found = document.title.trim() || fromMeta.trim() || fromHeading.trim();
            return found || new URL(window.location.href).hostname.replace('www.', '');
        };
        const titleWasFound = () => Boolean(document.title.trim() ||
            document.querySelector('meta[property="og:title"]')?.content?.trim() ||
            document.querySelector('meta[name="twitter:title"]')?.content?.trim() ||
            document.querySelector('h1')?.textContent?.trim());

        let title = pageTitle();
        let author = '';
        let date = new Date().toISOString().split('T')[0];
        let body = '';
        let textContent = '';
        let wordCount = 0;

        // Browser download APIs require a filesystem-safe filename. Normalize
        // common article date formats before they are incorporated into it.
        const normalizeDate = (value) => {
            if (!value) return null;

            const dateText = String(value).trim();
            const isoDate = dateText.match(/^\d{4}-\d{2}-\d{2}/);
            if (isoDate) return isoDate[0];

            const parsedDate = new Date(dateText);
            if (Number.isNaN(parsedDate.getTime())) return null;

            // Use local calendar components so a date-only source does not
            // shift to the previous or next day during UTC conversion.
            const year = String(parsedDate.getFullYear()).padStart(4, '0');
            const month = String(parsedDate.getMonth() + 1).padStart(2, '0');
            const day = String(parsedDate.getDate()).padStart(2, '0');
            return `${year}-${month}-${day}`;
        };

        // Kept so a failure can say how far each stage got: the popup has no
        // console on Android, so the reason has to travel back with the result.
        let readabilityLength = null;
        // What the page says it is written in, for the EPUB's language.
        const language = document.documentElement.getAttribute('lang') ||
            document.querySelector('meta[http-equiv="content-language" i]')?.content || '';

        if (hasReadability) {
            // Use Readability
            const docClone = document.cloneNode(true);
            // Each captured chart becomes a picture Readability can keep, in a
            // <figure> so it is not mistaken for an empty box.
            for (const holder of docClone.querySelectorAll('[data-x3-chart]')) {
                const index = holder.getAttribute('data-x3-chart');
                const figure = docClone.createElement('figure');
                const picture = docClone.createElement('img');
                picture.setAttribute('src', `x3-chart:${index}`);
                picture.setAttribute('alt', charts[Number(index)]?.alt || '');
                figure.appendChild(picture);
                holder.replaceWith(figure);
            }
            const reader = new Readability(docClone);
            const article = reader.parse();
            readabilityLength = article?.textContent?.length ?? 0;

            if (article && article.textContent && article.textContent.length >= 400) {
                title = article.title || pageTitle();
                author = article.byline || article.siteName || '';
                body = article.content;
                textContent = article.textContent;
                wordCount = textContent.split(/\s+/).length;

                // Try to get date
                const dateEl = document.querySelector('meta[property="article:published_time"]') ||
                    document.querySelector('time[datetime]');
                const extractedDate = article.publishedTime ||
                    (dateEl && (dateEl.getAttribute('content') || dateEl.getAttribute('datetime')));
                const normalizedDate = normalizeDate(extractedDate);
                if (normalizedDate) date = normalizedDate;

                // Get author from meta if not in article
                if (!author) {
                    author = document.querySelector('meta[name="author"]')?.content ||
                        document.querySelector('meta[property="article:author"]')?.content ||
                        new URL(window.location.href).hostname.replace('www.', '');
                }

                console.log('[X4] Readability extracted:', title, wordCount, 'words');

                return {
                    success: true,
                    article: {
                        title,
                        titleSource: article.title ? 'readability' : (titleWasFound() ? 'page' : 'hostname'),
                        author,
                        date,
                        wordCount,
                        // Which road the article took, so the popup can say it.
                        // On Android there is no console to ask afterwards.
                        extraction: 'readability',
                        readabilityLoaded: true,
                        readabilityLength,
                        drawings,
                        language,
                        body,
                        charts,
                        chartsFailed,
                        rawText: textContent,
                        sourceUrl: window.location.href
                    }
                };
            }
        }

        // Fallback: basic extraction
        console.log('[X4] Using fallback extraction');

        // Get main content area. Taking the first <article> is not enough: news
        // sites drop "read also" boxes into the body, and those are <article>
        // elements holding a couple of lines each, while the real text sits in
        // <main> split across many small containers. So weigh the candidates and
        // keep the narrowest one that still holds nearly all of the text — that
        // is the one carrying the least navigation around the article.
        const candidates = [
            ...document.querySelectorAll('article'),
            ...document.querySelectorAll('[role="main"]'),
            ...document.querySelectorAll('main')
        ].map((el) => ({ el, length: (el.innerText || el.textContent || '').length }))
            .filter((candidate) => candidate.length > 0);

        const longest = candidates.reduce((max, c) => Math.max(max, c.length), 0);
        let mainContent = document.body;
        if (longest >= 400) {
            mainContent = candidates
                .filter((candidate) => candidate.length >= longest * 0.8)
                .reduce((narrowest, candidate) => (candidate.length < narrowest.length ? candidate : narrowest))
                .el;
        }

        // The fallback reads the page as text, where a picture leaves nothing
        // behind - and a chart leaves its axis labels, as a paragraph of
        // numbers. So for the time of the reading each picture is hidden and a
        // paragraph holding only a marker stands in its place; the popup turns
        // the marker back into the picture. The page is put back straight after.
        const imageSources = [];
        const undo = [];
        const standIn = (element, src, alt) => {
            const marker = document.createElement('p');
            marker.textContent = `[[x3-image:${imageSources.length}]]`;
            imageSources.push({ src, alt });
            element.parentNode.insertBefore(marker, element);
            const display = element.style.display;
            element.style.display = 'none';
            undo.push(() => {
                marker.remove();
                element.style.display = display;
            });
        };
        try {
            for (const holder of mainContent.querySelectorAll('[data-x3-chart]')) {
                const index = Number(holder.getAttribute('data-x3-chart'));
                standIn(holder, `x3-chart:${index}`, charts[index]?.alt || '');
            }
            for (const picture of mainContent.querySelectorAll('img')) {
                if (imageSources.length >= 30) break;
                if (picture.closest('[data-x3-chart], nav, header, footer, aside')) continue;
                const src = picture.currentSrc || picture.src;
                // Icons, avatars, tracking pixels and pictures not yet loaded.
                if (!src || picture.getBoundingClientRect().width < 200 ||
                    picture.naturalWidth < 200 || picture.naturalHeight < 100) continue;
                standIn(picture, src, picture.alt || '');
            }
            textContent = mainContent.innerText || mainContent.textContent || '';
        } finally {
            undo.reverse().forEach(step => step());
        }
        wordCount = textContent.split(/\s+/).length;

        console.log('[X4] Fallback container:', mainContent.tagName, textContent.length, 'chars');

        if (textContent.length < 400) {
            console.log('[X4] Content too short:', textContent.length);
            const readabilityNote = !hasReadability
                ? 'Readability did not load'
                : `Readability returned ${readabilityLength} characters`;
            return {
                success: false,
                reason: 'content_too_short',
                length: textContent.length,
                detail: `${readabilityNote}; the largest block on this page holds ${textContent.length} characters (400 needed).`
            };
        }

        // Readability skips whatever the page marks as hidden, and a site that
        // opens a sheet over the article ("get the app") may mark the article
        // so. Reading the page as text, the fallback does not notice: how much
        // text sits under such a mark is what tells the two cases apart.
        const hiddenMark = '[aria-hidden="true"], [hidden]';
        const hiddenLength = [...document.querySelectorAll(hiddenMark)]
            .filter(el => !el.parentElement?.closest(hiddenMark))
            .reduce((sum, el) => sum + (el.textContent || '').length, 0);

        // Get metadata
        author = document.querySelector('meta[name="author"]')?.content ||
            document.querySelector('meta[property="article:author"]')?.content ||
            new URL(window.location.href).hostname.replace('www.', '');

        const dateEl = document.querySelector('meta[property="article:published_time"]') ||
            document.querySelector('time[datetime]');
        if (dateEl) {
            const dt = dateEl.getAttribute('content') || dateEl.getAttribute('datetime');
            const normalizedDate = normalizeDate(dt);
            if (normalizedDate) date = normalizedDate;
        }

        // Hand back the paragraphs rather than a finished body. Whatever the
        // site renders inside the block we picked comes along with the article -
        // ad slots, the byline broken into one line per name, the author
        // biographies - and throwing that out is the popup's job, where
        // ArticleCleanup is a normal module with tests. This function is
        // stringified and injected, so nothing here can be imported or tested.
        const paragraphs = textContent.split(/\n\n+/)
            .map(p => p.trim())
            .filter(p => p.length > 0);

        return {
            success: true,
            article: {
                title,
                titleSource: titleWasFound() ? 'page' : 'hostname',
                author,
                date,
                wordCount,
                extraction: 'fallback',
                readabilityLoaded: hasReadability,
                readabilityLength,
                hiddenLength,
                drawings,
                language,
                bodyParagraphs: paragraphs,
                charts,
                chartsFailed,
                imageSources,
                rawText: textContent,
                sourceUrl: window.location.href
            }
        };

    } catch (error) {
        console.error('[X4] Extraction error:', error);
        return { success: false, reason: error.message, detail: `Extraction failed: ${error.message}` };
    } finally {
        // The chart marks were only for the extraction: the page is left as found.
        document.querySelectorAll('[data-x3-chart]').forEach(holder => holder.removeAttribute('data-x3-chart'));
    }
}
