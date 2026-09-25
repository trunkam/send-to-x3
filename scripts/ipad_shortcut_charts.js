// For the iPad Shortcut "Send to X3", action "Run JavaScript on Web Page".
//
// Safari's article reader keeps the text and the photos but drops charts
// drawn as SVG (Highcharts on the WSJ and Barron's). This runs in the open
// page, where the chart and its styles still are, turns each chart into a
// PNG the same way the extension does on Android (extraction_logic.js,
// section CHARTS - keep the two in step), and returns one <figure> per chart
// for the Shortcut's Text step to add to the file. Each figure carries the
// opening words of the paragraphs just above the chart, nearest first, so
// the extension can put it back in its place (html_article.js).
//
// Whatever goes wrong, it answers - with nothing, or with the charts it has -
// so the Shortcut always goes on and the article is never lost for a chart.

(async () => {
    let done = false;
    const figures = [];
    const finish = () => {
        if (done) return;
        done = true;
        completion(figures.join('\n'));
    };
    // The Shortcut stops a script that takes too long: better the charts made
    // so far than none.
    setTimeout(finish, 15000);

    try {
        const STYLE_PROPERTIES = ['fill', 'fill-opacity', 'stroke', 'stroke-width', 'stroke-opacity',
            'stroke-dasharray', 'stroke-linecap', 'opacity', 'font-family', 'font-size', 'font-weight',
            'font-style', 'text-anchor', 'dominant-baseline', 'visibility', 'display'];
        const escape = (text) => String(text).replace(/&/g, '&amp;').replace(/"/g, '&quot;')
            .replace(/</g, '&lt;').replace(/>/g, '&gt;');

        const layers = [...document.querySelectorAll('svg')].filter((svg) => {
            if (svg.parentElement && svg.parentElement.closest('svg')) return false;
            if (svg.closest('nav, header, footer, aside, button, a')) return false;
            const box = svg.getBoundingClientRect();
            return box.width >= 300 && box.height >= 150;
        });

        // Highcharts draws one chart on two stacked SVGs: layers that mostly
        // cover each other are one chart.
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
        // the same once taken away from the site's stylesheet.
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

        // The paragraphs of prose above the chart, nearest first. More than
        // one, because the nearest may be the chart's own caption, which the
        // reader leaves out.
        const paragraphs = [...document.querySelectorAll('p')].filter(p =>
            !p.closest('nav, header, footer, aside') && p.textContent.replace(/\s+/g, ' ').trim().length >= 40);
        const anchorsBefore = (holder) => paragraphs
            .filter(p => !holder.contains(p) && (holder.compareDocumentPosition(p) & Node.DOCUMENT_POSITION_PRECEDING))
            .slice(-3)
            .reverse()
            .map(p => p.textContent.replace(/\s+/g, ' ').trim().slice(0, 80));

        for (const group of groups.slice(0, 15)) {
            try {
                const width = group.right - group.left;
                const height = group.bottom - group.top;
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

                let holder = group.svgs[0];
                for (const svg of group.svgs.slice(1)) {
                    const theirs = ancestors(svg);
                    holder = ancestors(holder).find(a => theirs.includes(a)) || holder;
                }
                if (holder.querySelectorAll('p').length > 2) holder = group.svgs[0];

                const titled = group.svgs.map(svg => svg.querySelector('.highcharts-title, [class*="headline"], title'))
                    .find(title => title && title.textContent.trim());
                const alt = (titled?.textContent || group.svgs[0].getAttribute('aria-label') || 'Chart').trim();
                const after = encodeURIComponent(JSON.stringify(anchorsBefore(holder)));
                figures.push(`<figure data-x3-chart data-x3-after="${after}"><img src="${dataUrl}" alt="${escape(alt)}"/></figure>`);
            } catch (error) {
                // This chart stays out; the others and the article go on.
            }
        }
    } catch (error) {
        // No charts, then: the article goes on without them.
    }
    finish();
})();
