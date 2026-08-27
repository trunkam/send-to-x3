# Send to X3

Send the article you are reading to an **Xteink X3** running **CrossPoint**
firmware, as a clean EPUB, over Wi-Fi.

This is a Gecko fork of **[Xatpy/send-to-x4](https://github.com/Xatpy/send-to-x4)**
(MIT). The upstream extension is excellent and runs on Chrome, Edge and Firefox
desktop. This fork exists for one thing it does not do: **run on Firefox for
Android**, so the phone in your pocket can send to the reader clipped to its
back.

> Status: **in daily use** — v1.3.3, signed, running on a Galaxy S23 with
> Firefox 153 against an X3 on CrossPoint 1.5.0.
>
> If you have an **X4**, or you are on a desktop, use
> [the original](https://github.com/Xatpy/send-to-x4) instead. Nothing here
> improves on it for that case.

---

## Why an extension, and not an app

Extraction happens inside the page you already have open — rendered, and logged
in. That is the whole point: **articles behind a paywall you pay for come
through whole**, because nothing is re-fetched from a server that isn't you.
An app or a read-later service has to fetch the URL itself, and gets the
paywall.

It also sidesteps mixed-content blocking: a page served over HTTPS cannot POST
to the reader over plain HTTP, but an extension can.

**Why Firefox**: Chrome for Android does not support extensions at all — the
code that handles them is not compiled into the Android build.

---

## What this fork changes

| | |
|---|---|
| **Runs under Gecko** | The manifest declares `background.scripts` alongside `background.service_worker`. Firefox ignores the latter, so without it the extension does not start *at all* — it does not degrade, it never runs. Chrome ignores the former, so the upstream build is unaffected. |
| **Android-shaped popup** | On Android the popup fills the screen instead of being a small window: no fixed 400px column, touch targets around 44px, scroll areas sized to the viewport. |
| **Several device addresses** | The single IP field became a list. All addresses are probed **in parallel** when the popup opens and the one that answers is used, and remembered. Changing network — home Wi-Fi, phone hotspot — needs no switching by hand. |
| **Date at the front of the filename** | Files arrive as `08-27 Title… - 2026-08-27.epub`. The device's file list truncates long names, so what sits at the end cannot be seen. Two digits, zero-padded, because the firmware sorts names as strings. |
| **Imports HTML** | `📂 Add files` now takes raw `.html` and converts it to EPUB, on top of the `.epub`/`.txt`/`.xtc` it already forwarded unchanged. This is what lets articles saved on other devices reach the reader — see below. |
| **X3 and CrossPoint by default** | Naming, destination folder (`send-to-x3/`), and firmware default. Error messages rewritten: the old ones told you to join the device's hotspot, which is the wrong advice here. |

---

## Collecting articles from other devices

An extension cannot watch a folder — no filesystem access, no API, and on
Firefox for Android not even `file://`. So there is no background automation
here: importing is something you do, on purpose, in one tap.

What works, with no server and no account, is a synced folder as a drop box:

- **PC** — the upstream extension's *Download* button, pointed at a synced
  folder.
- **iPad** — an iOS Shortcut built on *Get article from web page*: it reads the
  rendered article (paywalls included, same reason as above), turns it into
  HTML, and saves it to that folder.
- **Phone** — `📂 Add files` reaches the folder through the system file picker
  (Dropbox, Drive and Files all show up as document providers), and everything
  goes to the device with **Send all**.

HTML is converted on the way in: charts (`<svg>`) are dropped, the title is
taken from the `<h1>`, and the result is packaged as EPUB exactly like an
article extracted in the browser — same filename, same date folder.

---

## Installing

Firefox for Android will only install a **signed** extension, and the signed
build here is *unlisted* — it is tied to this author's Mozilla account, so the
`.xpi` in `web-ext-artifacts/` will not install for you. You have to sign your
own, which is free:

1. Get an API key at
   [addons.mozilla.org/developers/addon/api/key](https://addons.mozilla.org/developers/addon/api/key/).
   The secret is shown **once**.
2. Copy `.env.example` to `.env` and paste the two keys in. `.env` is gitignored.
3. Change the extension id in `manifest.json`
   (`browser_specific_settings.gecko.id`) to something of your own — the id here
   is already registered to this author and signing will be refused.
4. ```bash
   npm install
   npx web-ext sign --channel=unlisted
   ```
5. Open the resulting `.xpi` from Firefox on the phone and install it.

**On desktop**, for development, no signing is needed:

```bash
npx web-ext run          # opens a clean Firefox with the extension loaded
```

Note that a desktop popup closes when a file dialog opens, which makes
`📂 Add files` untestable from the panel. Open the popup as a tab instead —
`moz-extension://<uuid>/src/popup/popup.html`, the uuid being in the temporary
profile's `prefs.js`.

---

## Using it

Three buttons, not one:

| | |
|---|---|
| **📖 Send to X3** | Immediate send. **Disabled when the device does not answer** — that is deliberate, not a bug. |
| **➕ Queue** | Stores the article. This is what you want when the reader is off. |
| **📥 Download** | Saves the EPUB locally. |

**Queue extracts and stores the article there and then** — it is a snapshot, not
a link to re-fetch later. That is why it works on paywalled pages, and why it
survives closing the popup, closing Firefox, and rebooting the phone. The EPUB
is built at send time.

With the device on, **📤 Send all**. Keep the popup open during a batch: it is
the popup that drives the transfer. Close it and the queue stops; reopen it and
interrupted items are recovered.

**The queue does not start by itself.** Nothing notices that the reader has been
switched on, and finding out would mean polling the network in the background —
battery and permissions in exchange for one tap.

### The setup this is built around

The **phone is the hotspot** and the X3 joins it. The advantage is that the
phone keeps its mobile data while sharing, so you browse and send at the same
moment. With the hotspot coming from the reader instead, you land on a network
with no internet and have to extract first, send later.

Both addresses — the hotspot one and the home LAN one — live in the Settings
list, and the extension picks whichever answers.

---

## Under the hood

- Manifest V3, with `background.scripts` for Gecko and `background.service_worker`
  for Chromium. Script order matters: classic scripts share one lexical scope in
  manifest order.
- `gecko_android.strict_min_version` is **142**, the first version that supports
  `data_collection_permissions`.
- Article extraction: Mozilla Readability, injected on demand.
- EPUB generation: JSZip, in the browser.
- CrossPoint API (read from the source, not from memory): `POST /upload`,
  `GET /api/files`, `POST /mkdir`, `POST /delete`, on port 80, no auth.
- Tests: `npm test` (Node's built-in runner, no dependencies).

The IndexedDB database is still named `send-to-x4-transfer-queue`, and the
internal message types are still `X4_*`. Renaming them would orphan existing
queues for no visible gain.

---

## Twitter/X support

Inherited from upstream and untouched: threads are stitched together from the
original author only, and "Long Posts" / Notes are supported.

---

## Troubleshooting

**"No article detected"** — the page needs enough long-form text; give dynamic
pages a few seconds.

**The device does not answer** — check the address list in Settings; the green
dot marks the one that responded. Open `http://<address>/` in a browser to
confirm. On a phone hotspot the address comes from DHCP and *can* change: that
is the first thing to suspect when sending fails for no apparent reason.

**The popup does not open at all on Android** — occasionally, and not because of
this code: the popup is opened by Firefox, and none of this runs until it is on
screen. The likely cause is the separate process Gecko runs extensions in being
killed by Android under memory pressure. Setting Firefox's battery usage to
"Unrestricted" in Android settings is worth trying.

---

## Limitations

- Text only; images are disabled.
- Importing files is a manual step, and cannot be anything else from within an
  extension.
- Not a read-later service, and not cloud sync.

---

## Acknowledgements

- **[Xatpy](https://github.com/Xatpy)** — for the extension this forks. Almost
  everything here is theirs.
- **[borisfaure](https://github.com/borisfaure)** — for CrossPoint firmware
  support ([PR #2](https://github.com/Xatpy/send-to-x4/pull/2)).

## License

MIT, as upstream.
