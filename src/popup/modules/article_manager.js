import { extractArticle } from './extraction_logic.js';

// Cross-browser compatibility
const browserAPI = typeof browser !== 'undefined' ? browser : chrome;

/**
 * Article Manager
 * Handles article detection and extraction via content scripts
 */
export class ArticleManager {
    constructor() {
        this.articleData = null;
        // Why the last extraction came back empty, for the popup to display.
        this.lastFailureDetail = null;
    }

    /**
     * Check if current tab has a valid article
     * @returns {Promise<Object>} The extracted article data or null
     */
    async checkArticle() {
        try {
            const [tab] = await browserAPI.tabs.query({ active: true, currentWindow: true });

            if (!tab || !tab.id) {
                throw new Error('No active tab found');
            }

            // check if we can access the tab (e.g. chrome:// urls are restricted)
            if (tab.url.startsWith('chrome://') || tab.url.startsWith('edge://') || tab.url.startsWith('about:')) {
                throw new Error('Cannot access this page type');
            }

            console.log('[Article Manager] Checking tab:', tab.url);

            // Readability is declared as a content script, and injected here as
            // well for tabs opened before the extension was installed or
            // updated. The declaration is the road that works on Firefox for
            // Android: from 24/08 to 1.7.3 this injection stood alone there, and
            // every article on the phone went through the fallback.
            let injectFailure = null;
            try {
                await browserAPI.scripting.executeScript({
                    target: { tabId: tab.id },
                    files: ['src/content/readability.min.js']
                });
                console.log('[Article Manager] Readability injected');
            } catch (injectError) {
                // Extraction still runs and falls back to its own heuristics,
                // but the result is worse, so this is worth shouting about.
                console.error('[Article Manager] Could not inject Readability:', injectError.message);
                injectFailure = injectError.message || String(injectError);
            }

            // Now execute extraction logic
            const results = await browserAPI.scripting.executeScript({
                target: { tabId: tab.id },
                func: extractArticle
            });

            const result = results?.[0]?.result;
            console.log('[Article Manager] Extraction result:', result);

            if (result && result.success) {
                // Said in the popup when Readability is missing from the page:
                // there is no console on the phone to read it from.
                result.article.readabilityInjectError = injectFailure ||
                    'injected without error, yet not found by the extraction';
                this.articleData = this.finishArticle(result.article);
                this.lastFailureDetail = null;
                // Pictures take a download each: the article is shown now, and
                // whatever sends or queues it waits for readyArticle().
                this.imagesReady = this.prepareImages();
                return this.articleData;
            } else {
                console.log('[Article Manager] No article found:', result?.reason);
                this.lastFailureDetail = result?.detail || result?.reason || null;
                return null;
            }

        } catch (error) {
            console.error('[Article Manager] Article check error:', error);
            throw error;
        }
    }

    /* The fallback hands back paragraphs, not a body: it reads the page text
       off the biggest block it can find, so the site's furniture rides along.
       Dropping that and building the body happens here, where ArticleCleanup is
       an ordinary module with tests - inside the injected function it could be
       neither imported nor tested.

       Readability's own output arrives finished and is left alone.

       On both roads the title comes off the browser tab, which may carry a
       notification counter and a byline: ArticleTitle takes them off. */
    finishArticle(article) {
        const finished = this.finishBody(article);
        if (!globalThis.ArticleTitle) return finished;
        return { ...finished, title: ArticleTitle.clean(finished.title, finished.author) };
    }

    finishBody(article) {
        if (article.extraction !== 'fallback' || !Array.isArray(article.bodyParagraphs)) {
            return article;
        }

        const cleanup = globalThis.ArticleCleanup;
        // No quiet way out: building the body here without it would mean escaping
        // the text by hand a second time, and the last hand-written escape is the
        // one that let a WSJ ampersand cut the article in half.
        if (!cleanup) throw new Error('ArticleCleanup did not load');

        const { kept, dropped } = cleanup.stripChrome(article.bodyParagraphs);
        const rawText = kept.join('\n\n');
        console.log('[Article Manager] Fallback cleanup dropped', dropped.length, 'of',
            article.bodyParagraphs.length, 'paragraphs');

        return {
            ...article,
            body: cleanup.toBody(kept),
            rawText,
            wordCount: rawText.split(/\s+/).filter(Boolean).length,
            droppedParagraphs: dropped.length
        };
    }

    getArticleData() {
        return this.articleData;
    }

    /* Replaces the article with one whose pictures are made for both readers
       (ArticleImages), and keeps a count of what went in and what did not,
       charts the page could not turn into pictures included. */
    async prepareImages() {
        const article = this.articleData;
        this.imageReport = null;
        if (!article || !globalThis.ArticleImages) return article;
        try {
            const { article: prepared, added, failed } = await ArticleImages.prepare(article);
            if (this.articleData === article) this.articleData = prepared;
            this.imageReport = { added, failed: failed + (article.chartsFailed || 0) };
        } catch (error) {
            console.error('[Article Manager] Pictures not prepared:', error);
            this.imageReport = { added: 0, failed: 0, error: error.message };
        }
        return this.articleData;
    }

    // The article as it should be sent: with its pictures, once they are ready.
    async readyArticle() {
        if (this.imagesReady) await this.imagesReady;
        return this.articleData;
    }
}
