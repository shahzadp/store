# Alex Store

A small storefront for **Alex Store**. There is no checkout and no server —
browsers tap **Buy on WhatsApp** and the order happens over chat with
**+92 328 8304524**.

The product catalog is a **real SQLite database running in your browser**,
compiled to WebAssembly via [sql.js](https://sql.js.org/). Nothing is sent to
a backend, because there is no backend.

| File | Role |
| --- | --- |
| `catalog.sql` | The catalog. Plain text SQLite that seeds the browser database. |
| `catalog.json` | The same catalog as JSON, for the Android app. Generated, committed. |
| `build.mjs` / `build.config.json` | Regenerates the storefront HTML from `src/`. Zero dependencies. |
| `src/` | Page sources + `_layout.html`. **Edit these, not the root HTML.** |
| `hero-still-life.svg` | Hero illustration. |
| `db.js` | Boots SQLite, runs `catalog.sql`, exposes queries and edits. |
| `common.js` | PKR formatting, WhatsApp links, product cards. |
| `drawer.js` | Mobile navigation drawer. |
| `sticky.js` | Keeps the announcement bar and header pinned on scroll. |
| `search.js` | Search dialog: a single semantic search mode, no toggle. |
| `index.html` / `styles.css` / `app.js` | Homepage. **Generated** — edit `src/index.html`. |
| `shop.html` / `shop.js` | Products page with category filters. **Generated.** |
| `collections.html` / `collections.js` | Collections — editorial, not for sale. **Generated.** |
| `about.html` / `about.js`, `journal.html` / `journal.js` | Static copy pages. **Generated.** |
| `product.html` / `product.js` | Per-product page. **Generated.** |
| `admin.html` / `admin.css` / `admin.js` | Catalog editor. Hand-written, not part of the build. |
| `README.md` | This file. |

Live at https://shahzadp.github.io/store/
(products: `/shop.html`, collections: `/collections.html`, admin: `/admin.html`).

## Building the pages

The header, nav, search dialog, footer and script tags were hand-copied into
six pages — about 414 lines maintained in six places, so a nav change meant six
edits and the cache buster had to be bumped seven times by hand.

`build.mjs` regenerates those six files from `src/` plus `src/_layout.html`.

```bash
node build.mjs            # regenerate the root HTML
node build.mjs --check    # fail if the root is out of date (use this in CI)
```

**The root HTML files are generated artefacts and are committed.** GitHub Pages
serves them straight from the branch, so Pages still needs no build step, no
package manager and no `node_modules`. To change a page, edit its file in
`src/` and re-run the build.

`admin.html` is deliberately excluded: it is a separate single-page tool with
no shared chrome to deduplicate.

The cache buster now lives in one place — `build.config.json`. Bump `version`
there and re-run the build whenever you change any `.js` or `.css`. It is
injected into every stylesheet and script tag across all six pages, so it
cannot be missed on one page.

### The APK download button

`build.config.json` also holds `apkUrl`. It is empty by default, which renders
the hero button as an inert `aria-disabled` control — correct while there is no
APK. Set it to a release asset URL and re-run the build to turn it into a real
link:

```json
"apkUrl": "https://github.com/shahzadp/alex-store-app/releases/download/latest/apk/alex-store.apk"
```

The two states are genuinely different elements, not the same element with an
attribute flipped: a link with an empty `href` navigates to the current page,
and a button is not middle-clickable or long-press-savable. So the build emits
a `<button>` when the URL is empty and an `<a>` when it is not.

Use the **`latest`** release tag. GitHub lets an asset be replaced under the
same name, so that URL always serves the newest build and the site never needs
editing again. A versioned URL (`v1.0/apk/alex-store-1.0.apk`) means editing the
site on every single release.

The icon lives in `src/_android-icon.svg` so both variants share one copy.

Next.js was considered and rejected. GitHub Pages can only host a static
export, which forfeits SSR, ISR, server actions and middleware — the actual
reasons to want a framework here. This gets the deduplication benefit with zero
dependencies.

## Tooling

There is no `package.json`, lockfile or `node_modules`, and there is nothing
for a package manager to do: the only third-party code is sql.js, copied
verbatim into `vendor/` with its SHA-256 recorded in `db.js`. A package manager
becomes worth adopting the moment there is a real dependency tree — a
formatter, linter or test runner — and at that point npm or pnpm are
interchangeable.

## The Android app

The app should fetch **https://shahzadp.github.io/store/catalog.json**. It
cannot run sql.js, so `catalog.sql` is useless to it; the JSON is the same data
without the search vectors (6.9 KB against 25.6 KB for the SQL).

Regenerate and commit it whenever the catalog changes — the admin panel has a
**Download catalog.json** button next to the SQL one.

### Serving the APK without a server

Yes, and the best option is not Pages at all.

| Option | Verdict |
| --- | --- |
| **GitHub Releases** | **Recommended.** Attach the APK to a release; it is served from `github.com/.../releases/download/...`. No repo bloat, no size ceiling, versioned per build, and public repos download without login. |
| Commit the APK into the repo | Works, but Git rejects files over 100 MB and a large binary is permanent in git history — every future clone pays for it. Fine only for a small, rarely-changed file. |
| Git LFS | Avoids history bloat but Pages serves LFS objects from `media.githubusercontent.com`, not the Pages domain, so the button cannot be a same-origin link. |
| Pages itself | Fine below ~1 MB; GitHub Pages starts serving large files slowly well before the hard limits. |

So: no server, no new host, no extra cost — upload the APK as a release asset
and point the Download button at the release URL when there is one.

Two things that do not go away with any of these: the browser will show a
"this file may be harmful" interstitial for a sideloaded `.apk` on desktop
Chrome and Firefox (mobile Chrome downloads it without comment), and an APK
distributed outside the Play Store means Android will ask users to allow
unknown sources. A Play Store listing is the only way to remove both.

## Currency

The store trades in **PKR only** — there is no currency column and no way to
set another currency anywhere in the app. Prices are whole integer paisa
(`780000` = Rs 7,800) so there is no floating-point drift, and they render
through the `en-PK` locale as `Rs 7,800`.

---

## Changing the catalog

> **Adding or updating a product? Read [CATALOG-GUIDE.md](CATALOG-GUIDE.md)
> first.** It covers the step that fails silently — rebuilding the semantic
> search index — plus field rules, slug identity, verification and a
> symptom-to-cause table. This section is the short version.

**1. Edit visually.** Open https://shahzadp.github.io/store/admin.html, add or
edit products, then click **Download catalog.sql**.

**2. Rebuild the index first** if you changed any product's name, category or
description. Those three fields are the entire text that gets embedded. Skipping
it leaves search matching against the old wording — or, for a new product,
makes every search return nothing at all.

**3. Publish.** Replace `catalog.sql` in the repo with that file and push.

```bash
git add catalog.sql
git commit -m "Update catalog"
git push
```

GitHub Pages rebuilds in about a minute and everyone sees the change.

You can also skip the admin UI and edit the `INSERT` rows in `catalog.sql`
directly — it is ordinary SQL and diffs nicely in review.

### How drafts work

Admin edits are saved to this browser's `localStorage` first, so you can
experiment without touching the live site. **Visitors never see your draft** —
they always get the published `catalog.sql`. The admin panel shows a banner
when local edits are pending, and **Discard local edits** reverts.

## Vendored dependencies

`vendor/sql-wasm.js` and `vendor/sql-wasm.wasm` are committed copies of
sql.js 1.10.3's `dist/` build, unchanged. `db.js` points `locateFile()` at
`./vendor/` and every page loads `./vendor/sql-wasm.js` instead of a CDN
URL, so there is **no CDN in the critical path** — the catalog is the
entire site content, and when this was a jsDelivr fetch, a slow or blocked
request left the storefront blank with no error.

Verify the vendored copies against the published hashes recorded in
`db.js`.

## Search

The search icon (or `Ctrl`/`Cmd` + `K`) opens a dialog that embeds
your query with [ternlight](https://github.com/soycaporal/ternlight)
running in the browser, then ranks products against precomputed vectors
stored in SQLite. There is one search mode — no keyword/semantic toggle.

ternlight is a 1.58-bit BitNet-style sentence encoder distilled from
`all-MiniLM-L6-v2`. It is **not an ONNX model** — it ships no `.onnx`
graph and does not run on ONNX Runtime. The weights are a proprietary
packed binary and inference is a hand-written Rust engine compiled to
WebAssembly with SIMD, reimplementing `BitLinear.forward()`. Model,
tokenizer and engine are all embedded in one self-contained `.wasm`
(~10 MB raw, ~7 MB gzipped), so there is no separate weights download
and no runtime initialisation step beyond fetching that file.

`search.js` loads the `pkg-web` build rather than the package's default
entry. The default entry wraps the bundler target, which imports the
`.wasm` as an ESM asset and needs Vite or webpack to resolve it; `pkg-web`
resolves the sibling `.wasm` against `import.meta.url`, so a plain
`<script type="module">` on a static host loads it with no build step.

Embedding is synchronous once the engine is up: 384-dim, already
L2-normalised, capped at 128 tokens (~95 words). Ranking is therefore a
plain dot product — cosine similarity without the sqrt or the division.
On a 16-query store-specific set this scores hit@1 8/16 and hit@3 15/16,
against 7/16 and 12/16 for the SPLADE-tiny encoder it replaced (random is
2/16 and 6/16).

Product vectors are precomputed at publish time: in the admin panel,
**Build search index** embeds every product and the resulting
`catalog.sql` ships with the vectors baked in, so visitors only ever
embed their own query — never the catalog.

The engine itself is prefetched on an idle callback shortly after load,
so the ~10 MB download overlaps time the visitor is already spending on
the page instead of stalling their first search. It waits for the catalog
to finish loading first, and is skipped when the browser reports
`saveData`, when offline, or when no search index has been published —
there would be nothing to rank against. The prefetch shares
`loadEngine()`'s memoised promise with a real search, so whichever starts
first, the other just awaits the same download.

## How the index is maintained

Product vectors are **precomputed, and the step is manual**. Embedding runs
in the admin panel's browser — there is no server doing it — but nothing
triggers it automatically.

1. Edit or add products in `/admin.html`. Changes go to a local draft, not
   to `catalog.sql`.
2. Click **Build search index**. This embeds every product with the current
   engine and calls `replaceVectors`, which rewrites the whole
   `product_vectors` table so it cannot drift out of sync.
3. Click **Download catalog.sql** and replace the repo copy, then push.

Only after step 3 do visitors get the new vectors — they ship inside
`catalog.sql`.

There is a sharp edge worth knowing about. `indexIsComplete()` returns true
only when *every* product has a vector tagged with the current model, and
`rank()` bails out returning `[]` when it does not. So publishing a
`catalog.sql` containing a product that was never indexed does not merely
hide that one product from search — it silently returns **zero results for
every query**. The admin panel warns about this via the index note, but
nothing stops a publish from going out stale.

Rebuilding after a product edit also matters for quality, not just
coverage: the vector is built from `name. category. description`, so an
edited description is not reflected in search until the index is rebuilt.

Search failures are recoverable rather than terminal. Two cases used to
produce a dead search box:

- **Search opened before the catalog finished loading.** On a cold cache
  `rank()` queried the database before `Catalog.init()` had resolved and
  threw, which the dialog reported as "The model could not be loaded" —
  even though nothing was wrong with the model. `rank()` now waits for
  `Catalog.isReady()` first.
- **The model download dropped.** A ~10 MB transfer is easily interrupted
  on mobile. The failure is counted rather than latched, so the dialog
  retries automatically (up to 3 attempts, showing "Connection lost —
  downloading the model again…"). If all attempts fail it shows a
  **Try again** button instead of requiring the visitor to close and
  reopen the dialog.

A backstop stops a genuinely dead network from retrying on every keystroke:
after 3 consecutive failures `loadEngine()` refuses until `resetFailures()`
is called, which the **Try again** button does.

## Product pages and sharing

Every product has its own page at `product.html?slug=<slug>`, and that URL
is the canonical, shareable address — paste it anywhere and the same
product loads. The product card's image and title link there; **Buy on
WhatsApp** stays a separate, explicit action rather than being what an
image click happens to do.

Each card and each product page carries a **Share link** button. It copies
the product's absolute URL (`Store.shareUrl()`) and shows "Link copied" for
two seconds. It deliberately does *not* use `navigator.share`: that is
mobile-only and its title/body cannot be verified in a test, whereas
clipboard-copy behaves identically everywhere. A hidden-textarea fallback
covers browsers that refuse the async Clipboard API.

`product.js` also syncs document metadata per product — `document.title`,
the description, and `og:title` / `og:description` / `og:type` /
`og:url`, plus `og:image` when the catalog actually has an image URL (the
placeholder tints are colours, not URLs, so they are not advertised).
That is what makes a pasted link preview sensibly in WhatsApp and Slack.

An unknown or missing `?slug=` renders a "we couldn't find that product"
panel with a link back to the catalog, rather than a blank page.

## About page

`about.html` carries the trust content: who the shop is, how ordering
works in three steps, and six reasons to buy with confidence. It is a real
page now — the nav previously pointed at `./index.html#about`, an anchor
that never existed.

**The credibility copy deliberately states only what is verifiable.** Every
claim on that page is either true of how this store actually works
(ordering is a WhatsApp conversation with a person, prices are fixed in
PKR, sold-out products are labelled, the free-delivery threshold is
published) or is read live from the catalog. No founding year, no
"family-owned", no sourcing story — those are the owner's to supply, and
inventing them on a page whose whole job is building trust would defeat
the point. To add them, edit the copy in `about.html` directly.

`about.js` holds only bootstrap calls — it renders no content of its own. It
does call `Store.init()`, which is load-bearing even on a page with no
product list: that is what fills the announcement bar and rewrites every
`[data-whatsapp-general]` href. Skipping it leaves the page looking fine
while every WhatsApp link on it is `href="#"`.

## Journal page

`journal.html` exists because the nav carried a `Journal` item pointing at
`./index.html#journal` — an anchor that has never existed, so the link was
dead on every page. It is a real page now, currently empty.

The empty state is deliberate: it says "Nothing published yet" and links to
the catalog. A blank section reads as a broken page, and inventing posts to
fill it would be the same mistake as writing unverifiable About copy.

It has its own `journal.js` with the same bootstrap as `about.js`. There is
no journal table in SQLite yet — entries are meant to be static copy in
`journal.html` like the About page. If you want them editable in the admin
panel, that needs a schema change and is a separate piece of work.

## Analytics

GoatCounter is on every public page (`index`, `shop`, `collections`,
`about`, `product`, `journal`):

```html
<script data-goatcounter="https://mystore.goatcounter.com/count"
        async src="https://gc.zgo.at/count.js"></script>
```

It is `async`, so it never blocks rendering, and it is the only third-party
request on a page — the catalog itself is vendored.

Two deliberate choices:

- **The scheme is written out** (`https://gc.zgo.at/count.js`) rather than
  the protocol-relative `//gc.zgo.at/count.js`. Protocol-relative resolves
  to `http://` on a plain-http host, where the request is downgraded or
  blocked, so the tracker would silently record nothing when previewing
  locally.
- **`admin.html` is excluded.** It is the catalog editor, its only visitor
  is you, and counting it would just add noise. Say the word if you would
  rather track it — it would also show you if anything else reaches it.

### Button labels

Button labels live in a `.btn__label` wrapper. `.btn` is `display:inline-flex`,
so a bare text node sitting beside the `.wa-word` span becomes its own
anonymous flex item and its trailing space is collapsed — which rendered
"Buy onWhatsApp". One wrapper element keeps the space as ordinary text.

## Typography

System fonts only — Georgia for display, the platform UI sans for body,
the platform monospace for code. **No webfont is fetched.**

The site previously loaded Cormorant Garamond / Source Sans 3 / IBM Plex
Mono from Google Fonts with `display=swap`. On a cold cache that meant the
first paint rendered in the fallback stack and then visibly reflowed once
the webfont arrived: the hero title measured 691px wide in Georgia versus
534px in Cormorant, a 29% shift, and the heavier fallback is what read as
a bold flash followed by a settle.

Dropping the network font removes the swap entirely, so first and later
visits are identical and the page stops depending on a third party. The
trade is the typeface: headings are now Georgia rather than Cormorant
Garamond. Headings are noticeably wider, so line breaks on any fixed-size
headline may differ from the old design — worth a look on each page.

## How the WhatsApp hand-off works

Buy links are plain `wa.me` deep links, so they work with no WhatsApp app
installed, and nothing is transmitted anywhere:

```
Hi Alex Store! I'd like to order:

*Stoneware Mug*
Kitchen — Rs 7,800
Glazed stoneware, holds heat well and goes in the dishwasher.

Is it available?
```

The number is stored in the catalog's `settings` table (editable in the admin
panel), stored as country code + number with no `+`, spaces or dashes.

### The green "WhatsApp" word

The word "WhatsApp" is wrapped in `<span class="wa-word">` wherever it
appears in storefront text — the announcement bar, the drawer link, the
footer heading and button, and every Buy on WhatsApp button. Only that word
is tinted; the rest of each phrase keeps its own colour, so the buttons
stay white-on-purple. Static markup carries the span directly; text built in
JS goes through `Store.highlightWhatsApp()`, which escapes first and then
wraps the word (the announcement bar uses this, so it needs `innerHTML`
rather than `textContent`).

Three greens are defined, because one green cannot be legible on all three
surfaces these sit on:

| Token | Value | Used on | Contrast |
| --- | --- | --- | --- |
| `--wa-green` | `#25D366` | announce bar, footer heading (dark) | 7.30:1 |
| `--wa-green-on-light` | `#0F6B36` | drawer link (light page background) | 5.50:1 |
| `--wa-green-on-accent` | `#5CEB8F` | purple solid buttons | 4.54:1 |

The brand green alone scores **1.65:1** on the light page background — well
under the 4.5:1 AA threshold — which is why the drawer link uses a darker
green instead. All three clear AA for normal text on their own background.

The admin panel is excluded: its "WhatsApp number" entry is a form label,
not a call to action, and it was never white.

## Data model

`products` — `id`, `slug` (unique), `name`, `description`, `category`,
`price_cents`, `image_url`, `tint`, `in_stock`, `sort_order`.

`description` is a short, factual line shown between the name and the price,
and included in the WhatsApp order message. It is optional — a product with
none simply omits it rather than rendering an empty line. Capped at 300
characters.

`collections` — `id`, `slug` (unique), `title`, `description`, `image_url`,
`tint`, `sort_order`. **Deliberately unrelated to products.** A collection is
editorial: no price column, no stock, and no foreign key in either direction.
Collections are never derived from the product list, and no collection links to
the catalog. Deleting a product cannot affect a collection.

`product_vectors` — `slug` (primary key), `vector` (base64), `model`. One
precomputed embedding per product for search, built by the admin panel's
**Build search index** and published with `catalog.sql`. The model string
records which encoder produced each vector so a stale index is never
silently mixed with a different model's vectors.

`vector` is base64-encoded float32, 384 dimensions, dense — about 2 KB
per product, so the whole vector table adds ~16 KB to `catalog.sql`. No
sparse encoding is needed: the earlier SPLADE encoder emitted a
30522-dimensional vector that was only ~0.3% non-zero and had to be
stored sparsely to stay shippable, but 384 dense floats are small enough
to store as-is.

`settings` — free-form `key`/`value`:
| Key | Meaning |
| --- | --- |
| `store_name` | Shown in the logo, `document.title` and WhatsApp messages. |
| `whatsapp` | `wa.me` number: country code + digits, no `+` or spaces. |
| `free_delivery_over_paisa` | Threshold for the announcement bar, in paisa. |

Notes:
- Prices are **whole integer paisa**, so there is no floating-point drift.
  `780000` = Rs 7,800. The seeded prices were converted from the original
  dollar mockups and rounded to clean amounts.
- `slug` is generated from the name when left blank and must be unique.
- `tint` is only used when `image_url` is empty; pick from the design's
  lavender palette via the swatches in the admin panel.

## Design

The layout is a faithful reimplementation of the *Store — Desktop* and
*Store — Mobile* mockups as one responsive page, built with plain
HTML/CSS/JS. The `accent` colour from the mockups is `--accent` in
`styles.css`.

The mobile header's hamburger opens a slide-in drawer (`min(80vw, 300px)`)
with a tap-outside backdrop. It closes on link click, backdrop tap, the `X`,
`Escape`, or rotating past the 820px breakpoint — at which point the drawer
resets so it can't strand itself over the desktop layout.

`shop.html` lists every product with category filters (Kitchen / Textiles /
Candles / Decor), derived from the data and a live item count. Filter state is
kept in the query string (`?category=Kitchen`), so a filtered view can be
reloaded or shared.

**Collections are separate from products.** They are a distinct table, a
distinct page, and a distinct admin form. The two share no data: a collection
carries no price and no stock, and nothing links a collection to the catalog.
The only overlap is navigation — the header and footer link to both pages as
siblings.

## Security note

`admin.html` is public and has no login — but it only edits a database in your
own browser, so there is no shared state for anyone else to damage. The
published catalog only changes when you commit `catalog.sql`.