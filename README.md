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
| `index.html` / `styles.css` / `app.js` | The storefront. |
| `admin.html` / `admin.css` / `admin.js` | Catalog editor. |
| `README.md` | This file. |

Live at https://shahzadp.github.io/store/ (admin: `/admin.html`).

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

## How the WhatsApp hand-off works

Buy links are plain `wa.me` deep links, so they work with no WhatsApp app
installed, and nothing is transmitted anywhere:

```
https://wa.me/923288304524?text=Hi%20Alex%20Store!...
```

The number is stored in the catalog's `settings` table (editable in the admin
panel), stored as country code + number with no `+`, spaces or dashes.

## Data model

`products` — `id`, `slug` (unique), `name`, `category`, `price_cents`,
`currency`, `image_url`, `tint`, `in_stock`, `sort_order`.

`settings` — free-form `key`/`value`, currently `store_name` and `whatsapp`.

Notes:
- Prices are **whole integer paisa**, so there is no floating-point drift.
  `780000` = Rs 7,800. The seeded prices were converted from the original USD
  mockups at roughly 278 PKR/USD and rounded to clean amounts.
- Currency is per-product (`PKR` by default) and is rendered with the locale
  sellers expect, so PKR reads as `Rs 7,800` rather than `PKR 7,800`.
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

## Security note

`admin.html` is public and has no login — but it only edits a database in your
own browser, so there is no shared state for anyone else to damage. The
published catalog only changes when you commit `catalog.sql`.