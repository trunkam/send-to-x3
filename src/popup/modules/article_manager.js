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

            // Readability reaches the page only here now: the manifest no longer
            // declares it as a content script, since this ran on every popup
            // open anyway and the declared copy was loaded into every page.
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
            }

            // Now execute extraction logic
            const results = await browserAPI.scripting.executeScript({
                target: { tabId: tab.id },
                func: extractArticle
            });

            const result = results?.[0]?.result;
            console.log('[Article Manager] Extraction result:', result);

            if (result && result.success) {
                this.articleData = this.finishArticle(result.article);
                this.lastFailureDetail = null;
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

       Readability's own output arrives finished and is left alone. */
    finishArticle(article) {
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
}
