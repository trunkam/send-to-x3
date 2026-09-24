const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const ArticleTitle = require('../src/utils/article_title.js');

describe('ArticleTitle.clean', () => {
    it('takes off the counter and the byline Substack puts in the tab title', () => {
        assert.equal(ArticleTitle.clean("(1) L'AI ci ucciderà tutti? - by Riccardo Bassetto", 'Riccardo Bassetto'),
            "L'AI ci ucciderà tutti?");
    });

    it('takes off a counter of any size, "99+" included', () => {
        assert.equal(ArticleTitle.clean('(12) Title', ''), 'Title');
        assert.equal(ArticleTitle.clean('(99+) Title', ''), 'Title');
    });

    it('leaves a number in brackets that is part of the title', () => {
        assert.equal(ArticleTitle.clean('Why (1) matters', ''), 'Why (1) matters');
        assert.equal(ArticleTitle.clean('(1)Title with no space', ''), '(1)Title with no space');
    });

    it('takes off the byline only when it names the author found', () => {
        assert.equal(ArticleTitle.clean('Stand by Me - by Someone Else', 'Riccardo Bassetto'), 'Stand by Me - by Someone Else');
        assert.equal(ArticleTitle.clean('Title — by riccardo bassetto', 'Riccardo Bassetto'), 'Title');
    });

    it('reads the author as text, not as a pattern', () => {
        assert.equal(ArticleTitle.clean('Title - by A.B. (C)', 'A.B. (C)'), 'Title');
        assert.equal(ArticleTitle.clean('Title - by AxB', 'A.B'), 'Title - by AxB');
    });

    it('never leaves an article without a title', () => {
        assert.equal(ArticleTitle.clean('(3) ', ''), '(3)');
        assert.equal(ArticleTitle.clean('', 'x'), '');
    });
});
