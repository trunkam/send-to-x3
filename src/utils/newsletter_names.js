/* Newsletters name their issues, but not in a way a machine can read.

   On the browser version of an RCS newsletter the masthead — "Whatever It
   Takes" — exists only as an image with an empty alt, and the page's <title> is
   empty, so no amount of parsing will produce the name. The one machine-readable
   trace is the campaign marker the mailing system leaves in the address and in
   every tracking link:

       utid=...-Newsletter_COR_WHATEVERITTAKES

   That marker has no separators, so "WHATEVERITTAKES" cannot be turned into
   "Whatever It Takes" by rule — "Whateverittakes" is the best a rule could do,
   and "Ilpunto" shows how badly it reads. So the readable name is not guessed:
   it is written once, by the person who renames the first issue in the queue,
   and remembered against the marker. Every later issue of that newsletter is
   then named on its own.

   A newsletter whose mailing system leaves no marker still gets renamed — that
   correction just cannot be carried to the next issue, because there is nothing
   to file it under. */
const NewsletterNames = {
    // Seeded with the one this was built for; everything else is learned.
    SEED: [
        { marker: 'WHATEVERITTAKES', name: 'Whatever It Takes' }
    ],

    // marker -> name, as corrected by the user. Filled from storage by the
    // popup at startup; kept here so the parsing code stays synchronous.
    learned: {},

    /**
     * @param {Object} entries - marker -> name, as read back from storage
     */
    load(entries) {
        this.learned = {};
        for (const [marker, name] of Object.entries(entries || {})) {
            const key = String(marker || '').toUpperCase().trim();
            const value = String(name || '').trim();
            if (key && value) this.learned[key] = value;
        }
        return this.learned;
    },

    /**
     * @param {string} marker
     * @param {string} name
     * @returns {Object} the full learned table, for the caller to persist
     */
    remember(marker, name) {
        const key = String(marker || '').toUpperCase().trim();
        const value = String(name || '').trim();
        if (!key || !value) return this.learned;
        this.learned = { ...this.learned, [key]: value };
        return this.learned;
    },

    forget(marker) {
        const key = String(marker || '').toUpperCase().trim();
        const { [key]: removed, ...rest } = this.learned;
        this.learned = rest;
        return this.learned;
    },

    /**
     * The campaign marker, wherever the mailing system left one: the address,
     * the tracking links in the body, the saved file's name.
     *
     * @param {...string} haystacks
     * @returns {string} the marker in upper case, or '' when there is none
     */
    findMarker(...haystacks) {
        const text = haystacks.filter(Boolean).join(' ');
        const match = /Newsletter[_-][A-Za-z0-9]+[_-]([A-Za-z0-9]{3,})/i.exec(text);
        return match ? match[1].toUpperCase() : '';
    },

    /**
     * @param {...string} haystacks - address, file name, document
     * @returns {string} the newsletter's name, or '' when it is not known yet
     */
    detect(...haystacks) {
        const table = { ...Object.fromEntries(this.SEED.map(entry => [entry.marker.toUpperCase(), entry.name])), ...this.learned };

        const marker = this.findMarker(...haystacks);
        if (marker && table[marker]) return table[marker];

        // A marker in a shape findMarker does not know still matches by name,
        // which is how a seeded entry keeps working if the address changes.
        const text = haystacks.filter(Boolean).join(' ').toUpperCase();
        const known = Object.keys(table).find(candidate => text.includes(candidate));
        return known ? table[known] : '';
    }
};

// Expose for classic scripts, ES modules (globalThis), and Node tests (CommonJS)
globalThis.NewsletterNames = NewsletterNames;
if (typeof module !== 'undefined' && module.exports) {
    module.exports = NewsletterNames;
}
