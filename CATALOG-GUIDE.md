# Catalog guide — adding and updating products

Operational guide for changing the catalog. Written for whoever does it next,
including an agent with no prior context on this repo.

Read section 1 before anything else. It is the failure that has actually
happened here and it fails silently.

---

## 1. The rule that matters most

**After changing any product's `name`, `category` or `description`, rebuild the
search index before publishing.**

Semantic search does not read the product rows at query time. It compares your
query against **precomputed vectors** stored in the `product_vectors` table.
Those vectors are a snapshot of the text as it was when you last pressed
**Build search index**.

There are two distinct failure modes, and only one of them warns you:

| What you changed | What happens if you skip the rebuild |
| --- | --- |
| **Added** a product | `indexIsComplete()` goes false. **Every search returns zero results, for every query, on every page.** The site looks fine otherwise. |
| **Edited** name / category / description | `indexIsComplete()` stays **true**. Search keeps working — but that product is now matched against its **old** text. Stale results, no warning at all. |
| **Deleted** a product | Safe. Completeness only checks that every product *has* a vector, so nothing breaks. Rebuild anyway to drop the orphan row. |
| Changed price, `in_stock`, `tint`, `sort_order`, `image_url` | Not searchable. No rebuild needed. |

The second row is the dangerous one. Nothing tells you. If you rename
"Stoneware Mug" to "Hand-thrown Stoneware Mug" and skip the rebuild, a search
for *hand thrown* will not find it, and no test you run will fail.

**Rebuilding is cheap** — a few seconds once the engine is downloaded. There
is no reason to skip it.

---

## 2. Where the truth lives

```
catalog.sql          ← the published catalog. THE source of truth. Committed.
  ├─ products        ← what you edit
  ├─ collections     ← separate from products, NOT a product group
  ├─ settings        ← store name, WhatsApp number, free-delivery threshold
  └─ product_vectors ← 384-dim embeddings, base64. Generated, never hand-edited.
```

Flow for any change:

```
edit  →  rebuild index  →  Download catalog.sql  →  replace repo file  →  push
```

The middle two steps are the ones people skip.

**The admin panel edits a draft, not the site.** Every change is written to
`localStorage` under `alexstore.catalogDraft.v2` first. Visitors always get the
committed `catalog.sql`. Nothing you do in the admin is live until you download
and commit. **Discard local edits** reverts to the published catalog.

Drafts are per-origin. A draft on `localhost` is invisible to the admin panel
opened on `shahzadp.github.io`, and vice versa.

---

## 3. Before you start — the harmony rules

These are not preferences. Violating them breaks the design, and some of them
break requirements the shop is built on.

1. **Every product needs at least one factual line of description** — material,
   capacity, dimensions, care. It is the only prose a shopper reads before
   deciding, and it is **the bulk of what search matches on** (section 4).
   Write specifications, not sales copy. *"Glazed stoneware, holds heat well
   and goes in the dishwasher."* — not *"beautiful handcrafted mug."*

2. **Prices are whole paisa in an integer.** `780000` = Rs 7,800. No decimals,
   no rupees as text. The store is **PKR only** — there is no currency
   selector, and "USD" must never appear anywhere.

3. **Keep names to one or two lines.** The card reserves exactly two lines for
   the name and three for the description, and that is what makes the grid
   uniform. A long name is clamped with an ellipsis; a long description is
   clamped at three lines. The full text always lives on the product page, so
   truncation is safe — but a name that truncates is a sign the name is too
   long. Aim for **two or three words**.

4. **Descriptions over 300 characters are silently truncated** by validation.
   Nothing warns you. Keep them well under.

5. **Categories are short labels** — `Kitchen`, `Textiles`, `General`. They are
   embedded into the search text, so a vague or misspelled category quietly
   degrades search.

6. **Do not invent facts.** No invented founding years, sourcing stories,
   certifications or stockists. The About page states only verifiable claims
   for this reason; product copy deserves the same discipline.

7. **Sold-out means `in_stock = 0`.** The card then says *Sold out* rather than
   pretending to be purchasable. Do not delete the row instead.

---

## 4. How search actually works

Worth understanding before you write a single description.

- Visitors embed **their query only**. Product vectors ship inside
  `catalog.sql`.
- Ranking is a **plain dot product** over L2-normalised vectors. There is no
  keyword matching, no stemming, no BM25.
- The engine is **ternlight** (`SEARCH_MODEL = 'ternlight/base@0.1.1'`), 384
  dimensions, downloaded once per browser and cached. It is a 1.58-bit BitNet
  sentence encoder, **not** an ONNX model.
- `product_vectors` stores `slug → vector (base64 float32) + model`.

**The exact text embedded for each product** (`admin.js`, Build search index):

```js
`${p.name}. ${p.category}. ${p.description || ''}`.trim()
```

Two consequences that drive everything above:

- **The description is most of the searchable text.** Name and category are a
  few tokens. Write the description with the words a customer would actually
  type — *stoneware*, *flax*, *borosilicate*, *dishwasher*. They are matched
  semantically, so synonyms work, but concrete nouns are what carry signal.
- **Price is not embedded.** A search for "under 2000" will not do price
  filtering. Do not write price into the description to work around this.

Completeness is defined in `db.js`:

```js
function indexIsComplete(model = SEARCH_MODEL) {
  const products = all('SELECT slug FROM products');
  if (!products.length) return false;
  const rows = all('SELECT slug, model FROM product_vectors');
  const bySlug = new Map(rows.map((r) => [r.slug, r.model]));
  return products.every((p) => bySlug.get(p.slug) === model);
}
```

Every product needs a vector row, and that row's `model` must equal the
current `SEARCH_MODEL`. `search.js` guards on it:

```js
if (!Catalog.indexIsComplete()) return [];
```

which is exactly the silent-zero-results failure in section 1.

---

## 5. Adding a product

### Option A — the admin panel (recommended)

1. Open `admin.html`.
2. **Add product.**
3. Fill in name, price, category, description.
4. **Build search index.** Wait for `Indexed N products.` — the first run
   downloads the engine and can take a minute or two. This is the step that
   is easy to skip and must not be.
5. Confirm the banner reads **Index is current**.
6. **Download catalog.sql.**
7. Replace `catalog.sql` in the repo with it and push.

### Option B — editing `catalog.sql` directly

Ordinary SQL, diffs nicely in review. You must add **two** things: the product
row and its vector. Without the vector row, search breaks globally.

```sql
INSERT INTO products
  (slug, name, description, category, price_cents, image_url, tint, in_stock, sort_order)
VALUES
  ('walnut-board',
   'Walnut Cutting Board',
   'End-grain walnut, oiled finish, 38 x 24 cm. Hand wash, oil monthly.',
   'Kitchen', 245000, NULL, '#D9CCEA', 1, 90);
```

Then generate the vector. The admin panel is the only supported way — the
vector is a base64 float32 blob produced by the engine and **cannot be written
by hand**. So in practice: add the row in SQL, then open `admin.html`, press
**Build search index**, and **Download catalog.sql**. That download contains
both your new row and every regenerated vector.

### Slugs

Auto-generated from the name if you leave it blank:

```
"Stoneware Mug"  →  stoneware-mug
"Brass & Tray"   →  brass-tray        (ampersand stripped)
```

Must match `^[a-z0-9]+(?:-[a-z0-9]+)*$` — lowercase letters, numbers, single
dashes. Max 80 characters.

**The slug is the product's identity.** It keys the vector table, the share
link, and the WhatsApp message. Changing it orphans the vector row and breaks
existing links. If you must change it, rebuild the index and accept the broken
links.

### The three description fields

A product has **three** separate text fields. Confusing them is the most common
mistake here, because only one of them affects search.

| Field | Where it shows | Searchable? | In the WhatsApp message? |
| --- | --- | --- | --- |
| `description` | product cards, and in the "Full description" box only if `details` is empty | **Yes** — it is the bulk of the embedded text | **Yes** |
| `details` | the "Full description" box on the product page | No | No |
| `specs` | the "Specifications" box on the product page | No | No |

So `description` stays a single plain factual line and carries the search
signal. `details` is where the longer write-up lives. `specs` is structured
label/value data, entered in the admin as one `Label: value` per line and
stored as a JSON object:

```
Dimensions: 9 cm high x 8 cm wide
Weight: 320 g
Material: Glazed stoneware
Care: Dishwasher and microwave safe
```

Capped at 12 rows; labels are truncated at 40 characters and values at 120.
Malformed lines are dropped rather than blocking the save. A product with no
`specs` simply renders without a specifications box.

The spec values currently in `catalog.sql` are **placeholders** written to fill
the layout. Replace them with measured facts before the goods are listed.

### Rebuild scope

`description` changes need an index rebuild (section 1). **`details` and
`specs` changes do not** — neither is part of the embedded text. Editing a
product's long description or its measurements requires no rebuild.

### Field reference

| Field | Required | Rule |
| --- | --- | --- |
| `name` | yes | max 120 chars |
| `description` | by house rule | max 300 chars, **silently truncated** |
| `details` | no | max 4000 chars |
| `specs` | no | JSON object, max 12 label/value pairs |
| `category` | no | max 60 chars, defaults to `General` |
| `price_cents` | yes | whole paisa, `>= 0`, integer |
| `slug` | no | auto from name; see rules above |
| `image_url` | no | must be an `http(s)` URL, or empty |
| `tint` | no | hex colour used for the placeholder tile |
| `in_stock` | no | `1` or `0`; anything not `0` is treated as in stock |
| `sort_order` | no | integer, lower sorts first |

### Adding a column: four places, not one

A schema change must be mirrored in **all** of these or it fails quietly:

1. `catalog.sql` — the `CREATE TABLE`.
2. `db.js` → `toSql()` → the `CREATE TABLE` **inside the template literal**.
   This is a *copy*, not a reference. Miss it and every export declares a
   table without the column its own `INSERT` fills, and the exported file
   fails to import.
3. `db.js` → `toSql()` → the `INSERT INTO products (...)` column list. Also a
   hardcoded string.
4. `db.js` → `validate()` plus the `INSERT`/`UPDATE` in `createProduct` and
   `updateProduct`.

Verify with a round trip rather than by reading the diff: open the admin, press
**Download catalog.sql**, then replay the exported string into a fresh
sql.js database. If it throws, a column list is out of step.

Bump `DRAFT_KEY` in `db.js` when adding a column. A draft saved before the
change still parses but throws the moment a query references the new column,
which locks the admin out; bumping the key discards it cleanly.

---

## 6. Updating an existing product

Identical mechanics, with one extra rule.

**Safe without a rebuild:** price, `in_stock`, `tint`, `sort_order`,
`image_url`. None of these are searchable.

**Requires a rebuild:** `name`, `category`, `description`. These *are* the
search text. Editing them without rebuilding leaves a vector that no longer
describes the product.

Marking sold out — `in_stock = 0`, no rebuild:

```sql
UPDATE products SET in_stock = 0 WHERE slug = 'glass-carafe';
```

Renaming — rebuild:

```sql
UPDATE products
   SET name = 'Hand-thrown Stoneware Mug',
       description = 'Thrown and glazed in small batches. 350ml. Dishwasher safe.'
 WHERE slug = 'stoneware-mug';
```

…then **Build search index** → **Download catalog.sql** → replace → push.

### Editing by hand vs. the admin panel

The admin panel re-serialises the whole database, so a `Download` rewrites
every row in `catalog.sql` — including the 384-dimension vectors, which change
on every rebuild even when a product's text has not. Expect a large diff. That
is normal, not a sign something went wrong.

Editing SQL by hand produces a small, reviewable diff, but you must run the
admin panel at the end anyway to produce the vectors.

---

## 7. Changing the search model

Changing `SEARCH_MODEL` in `db.js` invalidates **every** vector, because
`indexIsComplete()` compares each row's `model` against it.

Ship the model change and the regenerated index **together**, in one commit.
Between them, every search on the live site returns nothing.

This repo has changed the encoder five times — `bekko-embedding-v1-a8m`,
`all-MiniLM-L6-v2`, `paraphrase-albert-small-v2`, `paraphrase-MiniLM-L3-v2`,
`splade-bert-tiny-nq-onnx`, and now ternlight. Each one required a full
reindex. Keep `SEARCH_DIMS` in step with the model's output size, or the
vectors decode to the wrong length and ranking silently degrades.

---

## 8. Publishing

```bash
# 1. Admin panel: Build search index, then Download catalog.sql
# 2. Replace the repo copy
cp ~/Downloads/catalog.sql ./catalog.sql

# 3. Bump the cache buster if you touched any .js or .css  (section 10)
# 4. Commit and push
git add catalog.sql
git commit -m "Add walnut cutting board; rebuild search index"
git push
```

GitHub Pages rebuilds in roughly a minute.

Do not hand-write into `product_vectors`. It is generated data; a bad blob is
indistinguishable from a good one until ranking quietly goes wrong.

---

## 9. Verify before you call it done

Run these. They take two minutes and each one catches a failure that is
invisible on the page.

```js
// in the browser console, on any storefront page
Catalog.listProducts().length        // expected count
Catalog.indexIsComplete()            // MUST be true — otherwise search is dead
Catalog.listCollections().length
```

Then, by hand:

1. **Search returns results for a plain query** — *mug*, *kitchen*. If zero
   results for everything, the index is incomplete.
2. **Search finds the new product by meaning** — try two or three natural
   phrasings a customer would use, not the exact product name. If you can only
   find it by typing its title, the description is too thin.
3. **The product grid is still uniform** — in a row, all cards the same
   height, all descriptions starting at the same height, all buttons on one
   baseline. `dist` via the browser inspector should show **one** value.
4. **The hero still fits on first screen** at 390×844 and 360×640.
5. **Every WhatsApp link resolves** to `wa.me/923288304524`, not `#`. If the
   announcement bar shows a bare "Order on WhatsApp" with no delivery
   threshold, `Store.init()` did not run on that page.
6. **Accessibility** — the Lighthouse panel: 1.0, no failures.

---

## 10. Two conventions that will bite you

### The cache buster

Every local `<script>` and `<link>` carries `?v=NN`. **Bump `NN` whenever you
change any `.js` or `.css` file**, or returning visitors keep the old file
and you will spend an hour debugging a fix that is already deployed.

```
./styles.css?v=45   ./db.js?v=45   ./common.js?v=45
```

Bump it on **all** pages at once — they are separate files with separate tags.
`admin.css` had been missed once.

### `db.js` line endings

`db.js` contains `\r\r\n` sequences from an old PowerShell write. The normal
edit tools fail to match newlines in that file. Patch it with a small Node
script using `\r*\n` regexes, not a text replace.

---

## 11. Do not edit these

- `vendor/sql-wasm.js`, `vendor/sql-wasm.wasm` — verbatim sql.js 1.10.3. Their
  SHA-256 hashes are recorded in `db.js`; if you touch them, the hashes lie.
- `product_vectors` rows — generated.
- Anything under `.wa-word` styling without reading the section on the three
  greens first. There are three, one per background, because no single green
  is legible on all three surfaces.

---

## 12. Symptom → cause

| Symptom | Cause |
| --- | --- |
| Search returns nothing, for any query | Index incomplete — a product has no vector row. Build the index. |
| Search works but one product is unfindable | Its text changed without a rebuild. Rebuild. |
| Search results are odd / unrelated | Stale vectors after a rename. Rebuild. |
| Storefront is blank, console quiet | `catalog.sql` failed to load or is malformed. Check it parses as SQL. |
| Every WhatsApp link is `href="#"` | `Store.init()` never ran on that page. Check the page's JS calls it. |
| Announcement bar missing the delivery threshold | Same cause as above. |
| Header slides under the announcement bar on scroll | `--sticky-h` is stale. `common.js` must call `syncStickyOffsets()` after rewriting the bar. |
| Hero cut off at the bottom of the first screen | `--sticky-h` stale, or hero content taller than `100svh - sticky`. Re-measure; the compact style is height-based. |
| Product grid rows ragged | A card's content escaped its reserved height. Check name ≤ 2 lines and description ≤ 3. |
| Site looks unchanged after a push | You forgot to bump `?v=NN`. |
| Horizontal scrollbar on mobile | Grid item with `min-width: auto`; `.products > li` sets `min-width: 0`. |

---

## 13. Condensed checklist for an agent

1. Read this file.
2. Edit `catalog.sql` (or use `admin.html`).
3. **Did you touch `name`, `category` or `description`? → rebuild the index.**
4. `Catalog.indexIsComplete()` is `true`.
5. Download `catalog.sql`, replace it in the repo.
6. Touched `.js`/`.css`? → bump `?v=NN` on **all** pages.
7. `node --check` every JS file you edited.
8. Push. Wait ~60s for the Pages build.
9. Verify on the live URL: search works, grid uniform, WhatsApp links resolve,
   Lighthouse a11y 1.0.
10. Commit the new `catalog.sql`. Do not leave it uncommitted.