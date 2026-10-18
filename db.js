/* ==========================================================================
   Catalog database — SQLite running in the browser via sql.js (WASM).
   Loaded by both the storefront and the admin panel.

   The database is built in memory from catalog.sql, the text file published
   with the site. There is no server: catalog.sql IS the source of truth.
   ========================================================================== */

// sql.js is vendored in ./vendor rather than pulled from a CDN. The whole
// catalog depends on this one file: if the CDN is slow, blocked by a proxy
// or ad blocker, or rate-limited, initSqlJs() never settles and the
// storefront renders empty with no error at all. Serving it ourselves
// removes that single point of failure.
//
// Vendored from sql.js@1.10.3, dist/ - unchanged:
//   sql-wasm.js   sha256 558a72c3ab3415d0e6d243cfd23f9d61543600d59054b4b7b8da3cd65f6b9fd4
//   sql-wasm.wasm sha256 d7e61b828523001f26ce0b3f88dabcf6c12e5e6edf80eb4f08b26ac7b946ff88
const SQLJS_BASE = './vendor/';
const CATALOG_URL = './catalog.sql';

// v2: the schema dropped the per-product currency column. Bumping the key
// means a stale USD draft in someone's browser is ignored rather than
// silently reappearing.
// v4: products gained an `options` column (selectable add-ons) and the store
// gained a delivery percentage and a voucher. A v3 draft predates them, so it
// is discarded rather than half-read.
const DRAFT_KEY = 'alexstore.catalogDraft.v4';

const Catalog = (() => {
  let db = null;
  let sql = null;

  /** Boot sql.js and build the in-memory database. */
  async function init() {
    if (db) return db;

    sql = await initSqlJs({ locateFile: (file) => SQLJS_BASE + file });

    let source = await loadCatalogSource();
    db = new sql.Database();

    try {
      db.run(source);
    } catch (err) {
      // A corrupt draft (for example, one saved by an older build) must never
      // lock the user out of the admin: fall back to the published catalog.
      if (hasDraft()) {
        console.warn('Local draft could not be parsed, discarding:', err);
        clearDraft();
        source = await loadCatalogSource();
        db.run(source);
      } else {
        throw err;
      }
    }

    // Guard against a malformed catalog silently producing an empty site.
    const { count } = one('SELECT COUNT(*) AS count FROM products');
    if (!count) throw new Error('Catalog loaded but contains no products');

    return db;
  }

  /**
   * A local draft wins over the published catalog, so the owner's unpublished
   * edits survive a reload. Visitors never have a draft, so they always get
   * the published file. The draft is only a fallback if catalog.sql is
   * unreachable.
   */
  async function loadCatalogSource() {
    const draft = localStorage.getItem(DRAFT_KEY);
    if (draft) return draft;

    try {
      const res = await fetch(CATALOG_URL, { cache: 'no-cache' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (err) {
      throw new Error(`Could not load catalog.sql (${err.message})`);
    }
  }

  /** True when this browser holds unpublished edits. */
  function hasDraft() {
    return Boolean(localStorage.getItem(DRAFT_KEY));
  }

  /** Rebuilds catalog.sql text from the live database. */
  function toSql() {
    const rows = all('SELECT * FROM products ORDER BY sort_order, id');
    const collections = all('SELECT * FROM collections ORDER BY sort_order, id');
    const settings = all('SELECT * FROM settings ORDER BY key');
    const vectors = all('SELECT slug, vector, model FROM product_vectors ORDER BY slug');

    const escape = (v) =>
      v === null || v === undefined
        ? 'NULL'
        : `'${String(v).replace(/'/g, "''")}'`;

    const productLines = rows
      .map(
        (p) =>
          `  (${escape(p.slug)}, ${escape(p.name)}, ${escape(p.description)}, ` +
          `${escape(p.details)}, ${escape(p.specs)}, ${escape(p.options)}, ${escape(p.category)}, ` +
          `${p.price_cents}, ${escape(p.image_url)}, ` +
          `${escape(p.tint)}, ${p.in_stock ? 1 : 0}, ${p.sort_order})`,
      )
      .join(',\n');

    const collectionLines = collections
      .map(
        (c) =>
          `  (${escape(c.slug)}, ${escape(c.title)}, ${escape(c.description)}, ` +
          `${escape(c.image_url)}, ${escape(c.tint)}, ${c.sort_order})`,
      )
      .join(',\n');

    const settingLines = settings
      .map((s) => `  (${escape(s.key)}, ${escape(s.value)})`)
      .join(',\n');

    // Each chunk is its own string literal joined with `||` at runtime:
    // SQLite does NOT implicitly concatenate adjacent string literals.
    const vectorLines = vectors
      .map((v) => {
        const literal = String(v.vector)
          .match(/.{1,72}/g)
          .map((chunk) => "'" + chunk + "'")
          .join(' || ');
        return `  (${escape(v.slug)},\n   ${literal},\n   ${escape(v.model)})`;
      })
      .join(',' + String.fromCharCode(10));

    return `-- Generated by admin.html — replace catalog.sql with this file and push.
-- Prices are whole paisa. Regenerated ${new Date().toISOString()}

CREATE TABLE IF NOT EXISTS products (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  slug        TEXT    NOT NULL UNIQUE,
  name        TEXT    NOT NULL,
  description TEXT    NOT NULL DEFAULT '',
  category    TEXT    NOT NULL DEFAULT 'General',
  price_cents INTEGER NOT NULL CHECK (price_cents >= 0),
  -- Long-form copy for the product page. The description column stays the
  -- one-line version used on cards, in search and in the WhatsApp message.
  details     TEXT,
  -- JSON object of label -> value for the specifications box.
  specs       TEXT,
  -- JSON array of selectable add-ons, e.g.
  -- [{"key":"cold_drink","label":"Cold drink"}]. An add-on is a preference
  -- carried into the WhatsApp message; it never changes the price.
  options     TEXT,
  image_url   TEXT,
  tint        TEXT,
  in_stock    INTEGER NOT NULL DEFAULT 1 CHECK (in_stock IN (0, 1)),
  sort_order  INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_products_sort ON products (sort_order, id);

-- Editorial groupings. No price, no stock, no link to products.
CREATE TABLE IF NOT EXISTS collections (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  slug        TEXT    NOT NULL UNIQUE,
  title       TEXT    NOT NULL,
  description TEXT    NOT NULL DEFAULT '',
  image_url   TEXT,
  tint        TEXT,
  sort_order  INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_collections_sort ON collections (sort_order, id);

-- One embedding per product, for semantic search.
CREATE TABLE IF NOT EXISTS product_vectors (
  slug   TEXT PRIMARY KEY,
  vector TEXT NOT NULL,
  model  TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);

INSERT OR IGNORE INTO settings (key, value) VALUES
${settingLines};

INSERT INTO products (slug, name, description, details, specs, options, category, price_cents, image_url, tint, in_stock, sort_order) VALUES
${productLines}
ON CONFLICT (slug) DO UPDATE SET
  name        = excluded.name,
  description = excluded.description,
  category    = excluded.category,
  price_cents = excluded.price_cents,
  image_url   = excluded.image_url,
  tint        = excluded.tint,
  in_stock    = excluded.in_stock,
  sort_order  = excluded.sort_order;

INSERT INTO collections (slug, title, description, image_url, tint, sort_order) VALUES
${collectionLines}
ON CONFLICT (slug) DO UPDATE SET
  title       = excluded.title,
  description = excluded.description,
  image_url   = excluded.image_url,
  tint        = excluded.tint,
  sort_order  = excluded.sort_order;
${vectors.length ? `\n-- Semantic search index.\nDELETE FROM product_vectors;\n\nINSERT INTO product_vectors (slug, vector, model) VALUES\n${vectorLines}\nON CONFLICT (slug) DO UPDATE SET\n  vector = excluded.vector,\n  model  = excluded.model;\n` : ''}`;
  }

  /** Persists the current database as this browser's unpublished draft. */
  function saveDraft() {
    localStorage.setItem(DRAFT_KEY, toSql());
  }

  function clearDraft() {
    localStorage.removeItem(DRAFT_KEY);
  }

  /* --------------------------------------------------------------- queries */

  function all(sqlText, params = []) {
    const stmt = db.prepare(sqlText);
    stmt.bind(params);
    const rows = [];
    while (stmt.step()) rows.push(stmt.getAsObject());
    stmt.free();
    return rows;
  }

  function one(sqlText, params = []) {
    return all(sqlText, params)[0] ?? null;
  }

  function run(sqlText, params = []) {
    const stmt = db.prepare(sqlText);
    stmt.bind(params);
    stmt.step();
    stmt.free();
  }

  /* ---------------------------------------------------------------- model */

  function listProducts() {
    return all('SELECT * FROM products ORDER BY sort_order ASC, id ASC');
  }

  /**
   * Editorial collections. Intentionally a separate table with no relation to
   * products: not for sale, no price, no stock, never derived from the
   * product list.
   */
  function listCollections() {
    return all('SELECT * FROM collections ORDER BY sort_order ASC, id ASC');
  }

  function getSetting(key) {
    return one('SELECT value FROM settings WHERE key = ?', [key])?.value ?? null;
  }

  function slugify(name) {
    return String(name)
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^a-z0-9\s-]/g, '')
      .trim()
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .slice(0, 80);
  }

  /**
   * Accepts either a JSON string or an array/object of pairs and returns a
   * canonical JSON object string. Labels are capped and the list is capped so
   * a runaway textarea cannot bloat every catalog.sql export.
   */
  function normaliseSpecs(input) {
    const MAX_LINES = 12;
    const MAX_LABEL = 40;
    const MAX_VALUE = 120;

    let pairs = [];

    if (typeof input === 'string' && input.trim()) {
      const raw = input.trim();
      // The admin form submits "Label: value" lines; already-stored JSON is
      // passed straight back through on edit.
      if (raw.startsWith('{')) {
        try {
          const parsed = JSON.parse(raw);
          if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            pairs = Object.entries(parsed);
          }
        } catch {
          pairs = [];
        }
      }
      if (!pairs.length) {
        pairs = raw
          .split('\n')
          .map((line) => line.trim())
          .filter(Boolean)
          .map((line) => {
            const at = line.indexOf(':');
            return at === -1 ? null : [line.slice(0, at).trim(), line.slice(at + 1).trim()];
          })
          .filter((pair) => pair && pair[0] && pair[1]);
      }
    } else if (Array.isArray(input)) {
      pairs = input.map((row) => [row && row.label, row && row.value]);
    } else if (input && typeof input === 'object') {
      pairs = Object.entries(input);
    }

    const out = {};
    for (const [label, value] of pairs.slice(0, MAX_LINES)) {
      const k = String(label || '').trim().slice(0, MAX_LABEL);
      const v = String(value === null || value === undefined ? '' : value).trim().slice(0, MAX_VALUE);
      if (k && v) out[k] = v;
    }

    return Object.keys(out).length ? JSON.stringify(out) : null;
  }

  /** Parses the stored specs JSON into ordered [label, value] pairs. */
  function specPairs(raw) {
    if (!raw) return [];
    try {
      const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return [];
      return Object.entries(parsed).filter(([k, v]) => k && v);
    } catch {
      return [];
    }
  }

  /**
   * Parses a product's selectable add-ons into ordered option objects.
   *
   * An add-on is a preference the shop is told about in the WhatsApp message
   * ("Cold drink (500ml): yes (+ Rs 100)"). `desc` is optional detail — the
   * size, say — and `price_cents` an optional surcharge stated in that message.
   * Neither changes the price shown on the page: the displayed price is the
   * price, and the message is where the shop reads the order.
   *
   * Stored as a JSON array so more can be added without another schema change.
   */
  function optionPairs(raw) {
    if (!raw) return [];
    try {
      const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (!Array.isArray(parsed)) return [];
      return parsed
        .map((o) => ({
          key: String((o && o.key) || '').trim(),
          label: String((o && o.label) || '').trim(),
          desc: String((o && o.desc) || '').trim(),
          price_cents: Math.max(0, Math.round(Number((o && o.price_cents) || 0) || 0)),
        }))
        .filter((o) => o.key && o.label);
    } catch {
      return [];
    }
  }

  /**
   * Canonical JSON for the `options` column, or null when there are none.
   *
   * The admin submits one option per line, with optional detail after pipes:
   *
   *   Cold drink | 500ml | 100
   *
   * — the label, a short description (the size, say) and a surcharge in RUPEES,
   * matching how the product price is entered. Only the label is required.
   * Already-stored JSON passes straight back through, so editing a product does
   * not lose a saved description or price. The key is derived from the label, so
   * a product saved through the admin cannot lose a mis-typed key.
   */
  function normaliseOptions(input) {
    // Already-canonical JSON: validate and hand it back untouched, so nothing
    // the admin did not edit is silently dropped.
    if (typeof input === 'string' && input.trim().startsWith('[')) {
      const parsed = optionPairs(input);
      return parsed.length ? JSON.stringify(parsed) : null;
    }

    const rows = [];
    if (typeof input === 'string' && input.trim()) {
      rows.push(...input.split('\n').map((line) => line.trim()).filter(Boolean));
    } else if (Array.isArray(input)) {
      for (const o of input) {
        if (typeof o === 'string') {
          rows.push(o);
          continue;
        }
        if (!o) continue;
        const parts = [String(o.label || o.key || '').trim()];
        if (o.desc) parts.push(String(o.desc).trim());
        const cents = Number(o.price_cents);
        if (Number.isFinite(cents) && cents > 0) parts.push(String(cents / 100));
        rows.push(parts.join(' | '));
      }
    }

    const out = [];
    for (const row of rows.slice(0, 6)) {
      const [rawLabel, rawDesc, rawPrice] = String(row || '').split('|');
      const text = String(rawLabel || '').trim().slice(0, 60);
      if (!text || out.some((o) => o.label === text)) continue;

      const option = { key: slugify(text), label: text };
      const desc = String(rawDesc || '').trim().slice(0, 60);
      if (desc) option.desc = desc;
      const rupees = Number(String(rawPrice || '').trim());
      if (Number.isFinite(rupees) && rupees > 0) option.price_cents = Math.round(rupees * 100);

      out.push(option);
    }
    return out.length ? JSON.stringify(out) : null;
  }

  /** Validates a payload; returns {ok:true, value} or {ok:false, errors}. */
  function validate(input) {
    const errors = {};

    const name = typeof input.name === 'string' ? input.name.trim() : '';
    if (!name || name.length > 120) errors.name = 'Required, max 120 characters';

    const description =
      typeof input.description === 'string' ? input.description.trim().slice(0, 300) : '';

    // Long-form copy for the product page. Not searchable, not shown on cards,
    // not part of the WhatsApp message.
    const details =
      typeof input.details === 'string' ? input.details.trim().slice(0, 4000) : '';

    // Specifications arrive from the admin as "Label: value" lines and are
    // stored as a JSON object so the page can render them as a definition list
    // without re-parsing text. Bad lines are dropped rather than rejected: a
    // half-typed row should not block saving the rest of the product.
    const specs = normaliseSpecs(input.specs);

    // Selectable add-ons, e.g. "Cold drink (500ml)". A preference, with an
    // optional surcharge, that is never folded into the price shown.
    const options = normaliseOptions(input.options);

    const price = Number(input.price_cents);
    if (!Number.isInteger(price) || price < 0) {
      errors.price_cents = 'Must be whole paisa, e.g. 780000 for Rs 7,800';
    }

    const category =
      typeof input.category === 'string' && input.category.trim()
        ? input.category.trim().slice(0, 60)
        : 'General';

    const requested = typeof input.slug === 'string' ? input.slug.trim().toLowerCase() : '';
    const slug = requested || slugify(name);
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
      errors.slug = 'Lowercase letters, numbers and single dashes only';
    }

    const imageUrl =
      typeof input.image_url === 'string' && input.image_url.trim() ? input.image_url.trim() : null;
    if (imageUrl && !/^https?:\/\//i.test(imageUrl)) errors.image_url = 'Must be an http(s) URL';

    if (Object.keys(errors).length) return { ok: false, errors };

    return {
      ok: true,
      value: {
        slug,
        name,
        description,
        details,
        specs,
        options,
        category,
        price_cents: price,
        image_url: imageUrl,
        tint: typeof input.tint === 'string' && input.tint.trim() ? input.tint.trim() : null,
        in_stock: input.in_stock === false || input.in_stock === 0 ? 0 : 1,
        sort_order: Number.isInteger(Number(input.sort_order)) ? Number(input.sort_order) : 0,
      },
    };
  }

  /** Validates a collection. Editorial only — no price, no stock. */
  function validateCollection(input) {
    const errors = {};

    const title = typeof input.title === 'string' ? input.title.trim() : '';
    if (!title || title.length > 120) errors.title = 'Required, max 120 characters';

    const description =
      typeof input.description === 'string' ? input.description.trim().slice(0, 600) : '';

    const requested = typeof input.slug === 'string' ? input.slug.trim().toLowerCase() : '';
    const slug = requested || slugify(title);
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
      errors.slug = 'Lowercase letters, numbers and single dashes only';
    }

    const imageUrl =
      typeof input.image_url === 'string' && input.image_url.trim() ? input.image_url.trim() : null;
    if (imageUrl && !/^https?:\/\//i.test(imageUrl)) errors.image_url = 'Must be an http(s) URL';

    if (Object.keys(errors).length) return { ok: false, errors };

    return {
      ok: true,
      value: {
        slug,
        title,
        description,
        image_url: imageUrl,
        tint: typeof input.tint === 'string' && input.tint.trim() ? input.tint.trim() : null,
        sort_order: Number.isInteger(Number(input.sort_order)) ? Number(input.sort_order) : 0,
      },
    };
  }

  function slugTaken(table, slug, exceptId = null) {
    // `table` is never user input — only the literals 'products'/'collections'.
    const row = exceptId
      ? one(`SELECT id FROM ${table} WHERE slug = ? AND id <> ?`, [slug, exceptId])
      : one(`SELECT id FROM ${table} WHERE slug = ?`, [slug]);
    return Boolean(row);
  }

  function createProduct(input) {
    const { ok, errors, value } = validate(input);
    if (!ok) return { ok: false, errors };
    if (slugTaken('products', value.slug)) return { ok: false, errors: { slug: 'Already in use' } };

    run(
      `INSERT INTO products
         (slug, name, description, details, specs, options, category, price_cents, image_url, tint, in_stock, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [value.slug, value.name, value.description, value.details, value.specs, value.options,
       value.category, value.price_cents, value.image_url, value.tint,
       value.in_stock, value.sort_order],
    );
    saveDraft();
    return { ok: true, value };
  }

  function updateProduct(id, input) {
    const { ok, errors, value } = validate(input);
    if (!ok) return { ok: false, errors };
    if (slugTaken('products', value.slug, id)) return { ok: false, errors: { slug: 'Already in use' } };

    run(
      `UPDATE products
          SET slug = ?, name = ?, description = ?, details = ?, specs = ?, options = ?,
              category = ?, price_cents = ?, image_url = ?, tint = ?,
              in_stock = ?, sort_order = ?
        WHERE id = ?`,
      [value.slug, value.name, value.description, value.details, value.specs, value.options,
       value.category, value.price_cents, value.image_url, value.tint,
       value.in_stock, value.sort_order, id],
    );
    saveDraft();
    return { ok: true, value };
  }

  function deleteProduct(id) {
    run('DELETE FROM products WHERE id = ?', [id]);
    saveDraft();
  }

  /* ---------------------------------------------------- semantic search */

// ternlight (@ternlight/base): a 1.58-bit BitNet-style sentence encoder
// distilled from all-MiniLM-L6-v2. Model, tokenizer and inference engine ship
// as a single WebAssembly module — there is no ONNX graph and no separate
// weights download, the `.wasm` is self-contained.
// Output is 384-dim and already L2-normalised, so ranking is a plain dot
// product and rows are stored dense: 384 float32 -> ~2 KB of base64 each.
// Vectors are precomputed in the admin panel and shipped in catalog.sql;
// visitors only embed their own query.
const SEARCH_MODEL = 'ternlight/base@0.1.1';
const SEARCH_DIMS = 384;

// The refund policy, in one place.
//
// THREE consumers need the same words, and two of them cannot see each other:
//
//   * catalog.json, which is the only file the Flutter app can read. toJson()
//     appends the note to every product's `details`, because the app renders
//     exactly three per-product text fields and `details` is the only one that
//     is neither embedded for search nor pasted into the WhatsApp message. That
//     is what carries a policy change to phones that already have the app.
//   * product.js, which shows the note under every product's full description.
//   * src/about.html, which carries the full wording and the cancellation fee.
//
// The About page is static copy on purpose - it should still state the policy
// if a script fails to load - so it is NOT generated from this constant, and
// the two must agree: if the fee or the window ever changes, change both. The
// product page and the app cannot drift apart, because they read this.
const REFUND_POLICY = {
  heading: 'Refunds and cancellations',
  note: 'Once an order has been dispatched, a cancellation fee applies.',
};

/** The exact text toJson() appends, and the only thing stripRefundPolicy
 *  removes. Built from REFUND_POLICY so the two cannot drift apart. */
function refundBlock() {
  return '\n\n' + REFUND_POLICY.note;
}

/** A product's copy with any appended note taken back off.
 *
 *  Trims, so re-exporting a catalog that already carries the note cannot stack
 *  a second copy - the admin's editor may have been seeded from a published
 *  catalog.json, note and all. That is also why the older, longer wording is
 *  removed on sight: the catalog.json published on 16 Oct 2026 carried a
 *  paragraph beginning "Refund policy: ", and a product showing both would read
 *  as two different promises.
 *
 *  The old text is matched whole and exactly. Anything that is not that string
 *  is the shopkeeper's own copy, and is left alone. */
const REFUND_LEGACY =
  '\n\nRefund policy: Cancel free before dispatch; a cancellation fee applies after dispatch. ' +
  'Damaged or wrong items are replaced or refunded in full if reported within 7 days. ' +
  'Full policy is on the About page.';

function stripRefundPolicy(text) {
  const body = String(text || '')
    .split(refundBlock())
    .join('')
    .split(REFUND_LEGACY)
    .join('')
    .trim();
  // A product with no copy at all exports as the bare note, with no blank line
  // in front of it. Without this it would grow a second copy on every export.
  return body === REFUND_POLICY.note ? '' : body;
}

/** A product's copy with the note on the end. */
function withRefundPolicy(text) {
  const body = stripRefundPolicy(text);
  return body ? body + refundBlock() : REFUND_POLICY.note;
}

  function float32ToBase64(vector) {
    const bytes = new Uint8Array(vector.buffer, vector.byteOffset, vector.byteLength);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
  }

  function base64ToFloat32(b64) {
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new Float32Array(bytes.buffer);
  }

  /** Embeddings for products, keyed by slug. Empty until an index is built. */
  function getVectors() {
    const out = new Map();
    for (const row of all('SELECT slug, vector, model FROM product_vectors')) {
      out.set(row.slug, { vector: base64ToFloat32(row.vector), model: row.model });
    }
    return out;
  }

  /** True when every product has a vector from the model we expect. */
  function indexIsComplete(model = SEARCH_MODEL) {
    const products = all('SELECT slug FROM products');
    if (!products.length) return false;

    const rows = all('SELECT slug, model FROM product_vectors');
    const bySlug = new Map(rows.map((r) => [r.slug, r.model]));

    return products.every((p) => bySlug.get(p.slug) === model);
  }

  /**
   * The same catalog as plain JSON, for clients that cannot run SQLite.
   *
   * The Flutter app fetches catalog.json from the site; it does not embed
   * sql.js or parse catalog.sql, so this is the only file it can read.
   *
   * product_vectors ARE included, as base64 on each product as `vector`.
   * The app embeds its own queries with the same ternlight model compiled
   * natively via flutter_rust_bridge — Dart cannot host a WASM runtime, so it
   * cannot run the engine the way a browser does, but it does not need to: it
   * only needs the precomputed product side, which is this. Without them the
   * app has no way to rank anything.
   *
   * `vector` is null when that product has no embedding, or when the stored
   * one was built by a different encoder. Null is a meaningful value, not a
   * gap: the app checks it and refuses to search rather than silently
   * comparing vectors from two different models, which produces a plausible
   * but entirely wrong ranking. See CATALOG-GUIDE.md section 1.
   *
   * `search_model` at the top level names the encoder these vectors belong to.
   * It is the same string as SEARCH_MODEL and the `model` column, so all three
   * can be cross-checked.
   *
   * price_cents stays an integer. Formatting "Rs 7,800" is a presentation rule
   * and duplicating it here means two places to change when it moves.
   */
  function toJson() {
    const settings = {};
    for (const row of all('SELECT key, value FROM settings')) settings[row.key] = row.value;

    const vectorBySlug = new Map(
      all('SELECT slug, vector, model FROM product_vectors').map((r) => [r.slug, r]),
    );

    /**
     * This product's precomputed embedding as base64, or null.
     *
     * Null covers three cases that must not be conflated:
     *   - no vector row at all (the index was never built, or was built before
     *     this product was added) — indexIsComplete() is false and search is
     *     dead site-wide until you rebuild;
     *   - a vector built by a previous SEARCH_MODEL — completeness still reads
     *     true, so search silently matches the old text. This is the one that
     *     bites;
     *   - a blob that does not decode to SEARCH_DIMS floats, which means it is
     *     not a ternlight d384 vector at all.
     *
     * The length check is the cheap one. Decoding a foreign vector and shipping
     * it would let the app rank against numbers that mean something else.
     */
    function vectorFor(slug) {
      const row = vectorBySlug.get(slug);
      if (!row || row.model !== SEARCH_MODEL) return null;
      if (base64ToFloat32(row.vector).length !== SEARCH_DIMS) return null;
      return row.vector;
    }

    const products = all('SELECT * FROM products ORDER BY sort_order ASC, id ASC').map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      price_cents: p.price_cents,
      in_stock: Boolean(p.in_stock),
      description: p.description,
      // The refund note is appended here, not stored in the products table:
      // the shop's own copy stays clean, and a product added later cannot miss
      // it. `p.details || p.description` keeps the app's own fall-back - it
      // shows the one-line description when there is no long copy - and then
      // adds the note, so nothing that used to be visible stops being visible.
      details: withRefundPolicy(p.details || p.description || ''),
      specs: specPairs(p.specs).reduce((acc, [k, v]) => {
        acc[k] = v;
        return acc;
      }, {}),
      image_url: p.image_url || null,
      tint: p.tint || null,
      // Selectable add-ons (e.g. "Cold drink (500ml)", + Rs 100). The buyer's
      // choice — and any surcharge — travels in the WhatsApp message; the price
      // shown on the page never changes.
      options: optionPairs(p.options),
      vector: vectorFor(p.slug),
    }));

    const collections = all('SELECT * FROM collections ORDER BY sort_order ASC, id ASC').map((c) => ({
      slug: c.slug,
      title: c.title,
      description: c.description,
      image_url: c.image_url || null,
      tint: c.tint || null,
    }));

    return JSON.stringify(
      {
        generated_at: new Date().toISOString(),
        store: {
          name: settings.store_name || 'Alex Store',
          whatsapp: settings.whatsapp || '',
          free_delivery_over_paisa: Number(settings.free_delivery_over_paisa || 0),
          // Delivery is a percentage of the order. Both surfaces show the
          // pre-delivery price struck through and the price itself unchanged,
          // so a percentage is the only number either of them needs. One
          // setting, read by the site AND the app, so they cannot disagree.
          delivery_percent: Number(settings.delivery_percent || 0),
          delivery_percent_low: Number(settings.delivery_percent_low || 0),
          delivery_threshold_paisa: Number(settings.delivery_threshold_paisa || 0),
          // The free-delivery offer, announced as a claimable voucher instead
          // of the old top strip. The threshold itself stays in
          // free_delivery_over_paisa; this is only how it is worded.
          voucher: {
            title: settings.voucher_title || 'Free delivery',
            code: settings.voucher_code || '',
            description: settings.voucher_description || '',
            terms: settings.voucher_terms || '',
          },
          currency: 'PKR',
          // The same words as the note appended to every product's `details`,
          // for an app build that would rather render the policy as its own
          // element than as the tail of a description. Nothing reads this
          // today; it is here so the data exists before the code needs it.
          refund_policy: {
            heading: REFUND_POLICY.heading,
            note: REFUND_POLICY.note,
          },
        },
        products,
        collections,
        search_model: SEARCH_MODEL,
      },
      null,
      2,
    );
  }

  /** Replaces the whole index so it can never drift out of sync. */
  function replaceVectors(entries, model = SEARCH_MODEL) {
    run('DELETE FROM product_vectors');
    for (const { slug, vector } of entries) {
      run('INSERT INTO product_vectors (slug, vector, model) VALUES (?, ?, ?)', [
        slug,
        float32ToBase64(vector),
        model,
      ]);
    }
    saveDraft();
  }

  /* ------------------------------------------------------- collections */

  function createCollection(input) {
    const { ok, errors, value } = validateCollection(input);
    if (!ok) return { ok: false, errors };
    if (slugTaken('collections', value.slug)) {
      return { ok: false, errors: { slug: 'Already in use' } };
    }

    run(
      `INSERT INTO collections (slug, title, description, image_url, tint, sort_order)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [value.slug, value.title, value.description, value.image_url, value.tint, value.sort_order],
    );
    saveDraft();
    return { ok: true, value };
  }

  function updateCollection(id, input) {
    const { ok, errors, value } = validateCollection(input);
    if (!ok) return { ok: false, errors };
    if (slugTaken('collections', value.slug, id)) {
      return { ok: false, errors: { slug: 'Already in use' } };
    }

    run(
      `UPDATE collections
          SET slug = ?, title = ?, description = ?, image_url = ?, tint = ?, sort_order = ?
        WHERE id = ?`,
      [value.slug, value.title, value.description, value.image_url, value.tint, value.sort_order, id],
    );
    saveDraft();
    return { ok: true, value };
  }

  function deleteCollection(id) {
    run('DELETE FROM collections WHERE id = ?', [id]);
    saveDraft();
  }

  /** Settings that the published catalog should carry. */
  function setSetting(key, value) {
    run('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value',
        [key, value]);
    saveDraft();
  }

  /** True once init() has resolved and queries are safe to run. */
  function isReady() {
    return db !== null;
  }

  return {
    init,
    isReady,
    listProducts,
    listCollections,
    getSetting,

    REFUND_POLICY,

    stripRefundPolicy,
    slugify,
    createProduct,
    updateProduct,
    deleteProduct,
    createCollection,
    updateCollection,
    deleteCollection,
    getVectors,
    indexIsComplete,
    replaceVectors,
    specPairs,
    optionPairs,
    SEARCH_MODEL,
    SEARCH_DIMS,
    setSetting,
    toSql,
  toJson,
    saveDraft,
    clearDraft,
    hasDraft,
  };
})();


