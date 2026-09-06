/**
 * EPUB Templates
 * Standard templates for EPUB structure
 */
const EpubTemplates = {
  /**
   * Generate mimetype file content
   */
  mimetype: 'application/epub+zip',

  /**
   * Generate container.xml
   */
  containerXml: `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`,

  /**
   * Generate content.opf
   * @param {Object} metadata - { title, author, date, uuid, coverMediaType }
   */
  contentOpf(metadata) {
    const { title, author, date, uuid, coverMediaType } = metadata;
    const creatorLine = author
      ? `    <dc:creator>${this.escapeXml(author)}</dc:creator>`
      : '';
    const dateLine = date
      ? `    <dc:date>${this.escapeXml(date)}</dc:date>`
      : '';

    // Cover metadata
    const coverMeta = coverMediaType
      ? `    <meta name="cover" content="cover-image" />`
      : '';

    const coverItem = coverMediaType
      ? `    <item id="cover-image" href="images/cover.jpg" media-type="${coverMediaType}" properties="cover-image"/>`
      : '';

    return `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" unique-identifier="bookid" version="2.0">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:opf="http://www.idpf.org/2007/opf">
    <dc:title>${this.escapeXml(title)}</dc:title>
${creatorLine}
${dateLine}
${coverMeta}
    <dc:identifier id="bookid">urn:uuid:${uuid}</dc:identifier>
    <dc:language>en</dc:language>
  </metadata>
  <manifest>
    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
    <item id="content" href="content.xhtml" media-type="application/xhtml+xml"/>
${coverItem}
  </manifest>
  <spine toc="ncx">
    <itemref idref="content"/>
  </spine>
</package>`;
  },

  /**
   * Generate toc.ncx
   * @param {Object} metadata - { title, uuid }
   */
  tocNcx(metadata) {
    const { title, uuid } = metadata;
    return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE ncx PUBLIC "-//NISO//DTD ncx 2005-1//EN" "http://www.daisy.org/z3986/2005/ncx-2005-1.dtd">
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head>
    <meta name="dtb:uid" content="urn:uuid:${uuid}"/>
    <meta name="dtb:depth" content="1"/>
    <meta name="dtb:totalPageCount" content="0"/>
    <meta name="dtb:maxPageNumber" content="0"/>
  </head>
  <docTitle>
    <text>${this.escapeXml(title)}</text>
  </docTitle>
  <navMap>
    <navPoint id="navpoint-1" playOrder="1">
      <navLabel>
        <text>${this.escapeXml(title)}</text>
      </navLabel>
      <content src="content.xhtml"/>
    </navPoint>
  </navMap>
</ncx>`;
  },

  /**
   * Generate content.xhtml for longpost
   * @param {Object} data - { title, author, date, body, url }
   */
  contentXhtml(data) {
    const { title, author, date, body, url } = data;

    // Build metadata line: @handle • date • Source: url
    const metaParts = [];
    if (author) metaParts.push(this.escapeXml(author));
    if (date) metaParts.push(this.escapeXml(date));
    if (url) metaParts.push(`<a href="${this.escapeXml(url)}">Source</a>`);
    const metaLine = metaParts.length > 0
      ? `<p class="meta">${metaParts.join(' • ')}</p>`
      : '';

    // Convert HTML body to XHTML (close void tags, make the entities XML's)
    const xhtmlBody = this.htmlToXhtml(body);

    return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.1//EN" "http://www.w3.org/TR/xhtml11/DTD/xhtml11.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="en">
<head>
  <meta http-equiv="Content-Type" content="application/xhtml+xml; charset=utf-8"/>
  <title>${this.escapeXml(title)}</title>
  <style type="text/css">
    body {
      margin: 1.5em;
      line-height: 1.7;
      font-family: Georgia, "Times New Roman", serif;
    }
    h1 {
      font-size: 1.5em;
      margin-bottom: 0.3em;
      line-height: 1.3;
    }
    .meta {
      color: #666;
      font-size: 0.85em;
      margin-bottom: 1.5em;
      padding-bottom: 1em;
      border-bottom: 1px solid #ddd;
    }
    .meta a {
      color: #666;
    }
    p {
      margin: 0.9em 0;
      text-align: left;
    }
    blockquote {
      margin: 1em 1.5em;
      padding-left: 1em;
      border-left: 3px solid #ccc;
      font-style: italic;
    }
  </style>
</head>
<body>
  <h1>${this.escapeXml(title)}</h1>
  ${metaLine}
  <div class="content">
    ${xhtmlBody}
  </div>
</body>
</html>`;
  },

  /**
   * Escape XML special characters
   * @param {string} text
   */
  escapeXml(text) {
    if (!text) return '';
    const map = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&apos;'
    };
    return String(text).replace(/[&<>"']/g, m => map[m]);
  },

  /**
   * Convert HTML to XHTML by properly closing self-closing tags
   * @param {string} html
   */
  htmlToXhtml(html) {
    if (!html) return '';

    // List of void/self-closing elements in HTML that must be self-closed in XHTML
    const voidElements = [
      'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
      'link', 'meta', 'param', 'source', 'track', 'wbr'
    ];

    // Pattern to match void elements that are not already self-closed
    // Matches: <tag ...> but not <tag ... /> or <tag .../>
    const pattern = new RegExp(
      `<(${voidElements.join('|')})([^>]*?)(?<!/)>`,
      'gi'
    );

    // Replace with self-closing version
    // Also ensures we don't double-close if the regex is too greedy, but (?<!/) handles the check.
    return this.xmlSafeEntities(html.replace(pattern, '<$1$2 />'));
  },

  /**
   * The handful of HTML named entities that turn up in article prose, with the
   * character each one stands for. XML declares five names and no more, so
   * every other name has to travel as a number instead.
   */
  NAMED_ENTITIES: {
    nbsp: 160, iexcl: 161, cent: 162, pound: 163, curren: 164, yen: 165,
    sect: 167, uml: 168, copy: 169, laquo: 171, not: 172, shy: 173, reg: 174,
    deg: 176, plusmn: 177, sup2: 178, sup3: 179, micro: 181, para: 182,
    middot: 183, raquo: 187, frac14: 188, frac12: 189, frac34: 190,
    times: 215, divide: 247, ndash: 8211, mdash: 8212, lsquo: 8216,
    rsquo: 8217, sbquo: 8218, ldquo: 8220, rdquo: 8221, bdquo: 8222,
    dagger: 8224, Dagger: 8225, bull: 8226, hellip: 8230, permil: 8240,
    prime: 8242, Prime: 8243, euro: 8364, trade: 8482
  },

  /**
   * XML knows five entity names and no more, and a bare ampersand is not a
   * character in it but a syntax error. Article prose carries both: a WSJ page
   * ends on "Dow Jones & Company", and a body serialised out of the DOM writes
   * a non-breaking space as &nbsp;. Either one leaves content.xhtml ill-formed,
   * and a reader that parses it strictly - the X3 does - loses the document
   * from that point on, so turning the page there lands back on the first page
   * instead of the next.
   *
   * References that are already valid come out untouched, so running this over
   * text an earlier step escaped changes nothing.
   *
   * @param {string} text
   */
  xmlSafeEntities(text) {
    const XML_NAMES = ['amp', 'lt', 'gt', 'quot', 'apos'];

    return String(text).replace(
      /&(?:([a-zA-Z][a-zA-Z0-9]*)|#[0-9]+|#[xX][0-9a-fA-F]+);|&/g,
      (match, name) => {
        // No name captured means the match was a numeric reference, or the
        // lone ampersand of the last branch.
        if (name === undefined) return match === '&' ? '&amp;' : match;
        if (XML_NAMES.includes(name)) return match;

        const code = this.NAMED_ENTITIES[name];
        // A name nobody here knows keeps its letters and loses its meaning:
        // wrong on the page, but the page still opens.
        return code ? `&#${code};` : `&amp;${name};`;
      }
    );
  }
};

// Expose for classic scripts, ES modules (globalThis), and Node tests (CommonJS)
globalThis.EpubTemplates = EpubTemplates;
if (typeof module !== 'undefined' && module.exports) {
  module.exports = EpubTemplates;
}
