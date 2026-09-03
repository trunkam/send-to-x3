/**
 * Article extraction logic
 * This function is stringified and injected into the page, so it must be self-contained.
 */
// Note: This function is stringified, so no imports allowed!
export function extractArticle() {
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

        if (hasReadability) {
            // Use Readability
            const docClone = document.cloneNode(true);
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
                        body,
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

        textContent = mainContent.innerText || mainContent.textContent || '';
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

        // Create simple HTML body
        const paragraphs = textContent.split(/\n\n+/).filter(p => p.trim().length > 0);
        body = paragraphs.map(p => `<p>${p.trim().replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>`).join('\n');

        return {
            success: true,
            article: {
                title,
                titleSource: titleWasFound() ? 'page' : 'hostname',
                author,
                date,
                wordCount,
                body,
                rawText: textContent,
                sourceUrl: window.location.href
            }
        };

    } catch (error) {
        console.error('[X4] Extraction error:', error);
        return { success: false, reason: error.message, detail: `Extraction failed: ${error.message}` };
    }
}
