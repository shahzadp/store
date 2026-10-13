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
| `hero-still-life.svg` | Hero illustration. |
| `db.js` | Boots SQLite, runs `catalog.sql`, exposes queries and edits. |
| `common.js` | PKR formatting, WhatsApp links, product cards. |
| `drawer.js` | Mobile navigation drawer. |
| `sticky.js` | Keeps the announcement bar and header pinned on scroll. |
| `search.js` | Search dialog: instant text mode + opt-in semantic mode. |
| `index.html` / `styles.css` / `app.js` | Homepage. |
| `shop.html` / `shop.js` | Products page with category filters. |
| `collections.html` / `collections.js` | Collections — editorial, not for sale. |
| `admin.html` / `admin.css` / `admin.js` | Catalog editor. |
| `README.md` | This file. |

Live at https://shahzadp.github.io/store/
(products: `/shop.html`, collections: `/collections.html`, admin: `/admin.html`).

## Currency

The store trades in **PKR only** — there is no currency column and no way to
set another currency anywhere in the app. Prices are whole integer paisa
(`780000` = Rs 7,800) so there is no floating-point drift, and they render
through the `en-PK` locale as `Rs 7,800`.

---

## Changing the catalog

**1. Edit visually.** Open https://shahzadp.github.io/store/admin.html, add or
edit products, then click **Download catalog.sql**.

**2. Publish.** Replace `catalog.sql` in the repo with that file and push.

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

## Search

The search icon (or `Ctrl`/`Cmd` + `K`) opens a dialog with two modes:

- **Text (default)** — instant, no download. Matches against the
  product name, category and description.
- **Semantic (opt-in)** — a **Semantic** toggle in the dialog embeds
  your query with [all-MiniLM-L6-v2](https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2)
  running in the browser, then ranks products by cosine similarity
  against precomputed vectors stored in SQLite.

The embedding model is **~86 MB** (fp32). It is **never loaded
until you turn Semantic on**, and it is then cached in IndexedDB —
you download it once per browser, not once per search. Text search
always stays available and instant.

> **Language tradeoff.** all-MiniLM-L6-v2 is **English-only**. If
> Urdu or Roman-Urdu queries matter more than the smaller download,
> swap `SEARCH_MODEL` in `db.js` to
> `hotchpotch/bekko-embedding-v1-a8m` (124 MB, multilingual, 100+
> languages) and rebuild the index — the two are not interchangeable,
> so switching models always means re-running **Build search index**
> and republishing `catalog.sql`.

The product vectors are precomputed at publish time: in the admin
panel, **Build search index** embeds every product and the resulting
`catalog.sql` ships with the vectors baked in, so visitors only ever
embed their own query — never the catalog.

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

`product_vectors` — `slug` (primary key), `vector` (base64-encoded
float32, 384 dimensions), `model`. One precomputed embedding per product
for semantic search, built by the admin panel's **Build search index**
and published with `catalog.sql`. The model string records which encoder
produced each vector so a stale index is never silently mixed with a
different model's vectors.

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