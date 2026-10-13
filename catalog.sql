-- ===========================================================================
-- Alex Store catalog
--
-- This file seeds a real SQLite database in the visitor's browser.
-- To change the catalog: edit the INSERT rows below and push. GitHub Pages
-- rebuilds and everyone sees the change — no server involved.
--
-- Rules:
--   * price_cents is whole paisa (780000 = Rs 7,800). Never use decimals.
--   * The store trades in PKR only — there is no currency column.
--   * slug must be unique; it is derived from the name if left to the admin UI.
--   * tint is a fallback colour for products with no image_url.
--
-- products and collections are deliberately unrelated tables. A collection is
-- editorial: it is not for sale, carries no price, and is never derived from
-- the product list. Nothing links a collection to products in either direction.
-- ===========================================================================

CREATE TABLE IF NOT EXISTS products (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  slug        TEXT    NOT NULL UNIQUE,
  name        TEXT    NOT NULL,
  category    TEXT    NOT NULL DEFAULT 'General',
  price_cents INTEGER NOT NULL CHECK (price_cents >= 0),
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

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

INSERT OR IGNORE INTO settings (key, value) VALUES
  ('store_name', 'Alex Store'),
  ('whatsapp',   '923288304524'),
  ('free_delivery_over_paisa', '600000');

INSERT INTO products (slug, name, category, price_cents, tint, in_stock, sort_order) VALUES
  ('stoneware-mug',  'Stoneware Mug',   'Kitchen',   780000, '#D9CCEA', 1, 10),
  ('linen-throw',    'Linen Throw',     'Textiles', 1780000, '#E8DDF2', 1, 20),
  ('glass-carafe',   'Glass Carafe',    'Kitchen',  1170000, '#CFC3E3', 1, 30),
  ('soy-candle',     'Soy Candle',      'Candles',   670000, '#E3D6EE', 1, 40),
  ('ceramic-vase',   'Ceramic Vase',    'Decor',    1560000, '#E3D6EE', 1, 50),
  ('wool-cushion',   'Wool Cushion',    'Textiles', 1330000, '#CFC3E3', 1, 60),
  ('serving-bowl',   'Serving Bowl',    'Kitchen',  1000000, '#E8DDF2', 1, 70),
  ('brass-tray',     'Brass Tray',      'Decor',    1450000, '#D9CCEA', 1, 80)
ON CONFLICT (slug) DO UPDATE SET
  name        = excluded.name,
  category    = excluded.category,
  price_cents = excluded.price_cents,
  tint        = excluded.tint,
  in_stock    = excluded.in_stock,
  sort_order  = excluded.sort_order;

INSERT INTO collections (slug, title, description, tint, sort_order) VALUES
  ('the-quiet-edit',  'The Quiet Edit',   'A restrained palette of stoneware, linen and brass chosen to sit easily in an already-lived room.', '#D9CCEA', 10),
  ('table-and-tide',  'Table & Tide',     'Pieces for the everyday table — mugs, carafes and bowls made to be used daily and washed often.', '#CFC3E3', 20),
  ('soft-light',      'Soft Light',       'Candles and objects that catch a low, late light. Best near a window at the end of the day.', '#E3D6EE', 30)
ON CONFLICT (slug) DO UPDATE SET
  title       = excluded.title,
  description = excluded.description,
  tint        = excluded.tint,
  sort_order  = excluded.sort_order;