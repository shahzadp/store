-- ===========================================================================
-- Alex Store catalog
--
-- This file seeds a real SQLite database in the visitor's browser.
-- To change the catalog: edit the INSERT rows below and push. GitHub Pages
-- rebuilds and everyone sees the change — no server involved.
--
-- Rules:
--   * price_cents is whole cents (2800 = $28.00). Never use decimals.
--   * slug must be unique; it is derived from the name if left to the admin UI.
--   * tint is a fallback colour for products with no image_url.
-- ===========================================================================

CREATE TABLE IF NOT EXISTS products (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  slug        TEXT    NOT NULL UNIQUE,
  name        TEXT    NOT NULL,
  category    TEXT    NOT NULL DEFAULT 'General',
  price_cents INTEGER NOT NULL CHECK (price_cents >= 0),
  currency    TEXT    NOT NULL DEFAULT 'USD',
  image_url   TEXT,
  tint        TEXT,
  in_stock    INTEGER NOT NULL DEFAULT 1 CHECK (in_stock IN (0, 1)),
  sort_order  INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_products_sort ON products (sort_order, id);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

INSERT OR IGNORE INTO settings (key, value) VALUES
  ('store_name', 'Alex Store'),
  ('whatsapp',   '923288304524');

INSERT INTO products (slug, name, category, price_cents, currency, tint, in_stock, sort_order) VALUES
  ('stoneware-mug',  'Stoneware Mug', 'Kitchen',  2800, 'USD', '#D9CCEA', 1, 10),
  ('linen-throw',    'Linen Throw',   'Textiles', 6400, 'USD', '#E8DDF2', 1, 20),
  ('glass-carafe',   'Glass Carafe',  'Kitchen',  4200, 'USD', '#CFC3E3', 1, 30),
  ('soy-candle',     'Soy Candle',    'Candles',  2400, 'USD', '#E3D6EE', 1, 40),
  ('ceramic-vase',   'Ceramic Vase',  'Decor',    5600, 'USD', '#E3D6EE', 1, 50),
  ('wool-cushion',   'Wool Cushion',  'Textiles', 4800, 'USD', '#CFC3E3', 1, 60),
  ('serving-bowl',   'Serving Bowl',  'Kitchen',  3600, 'USD', '#E8DDF2', 1, 70),
  ('brass-tray',     'Brass Tray',    'Decor',    5200, 'USD', '#D9CCEA', 1, 80)
ON CONFLICT (slug) DO UPDATE SET
  name        = excluded.name,
  category    = excluded.category,
  price_cents = excluded.price_cents,
  currency    = excluded.currency,
  tint        = excluded.tint,
  in_stock    = excluded.in_stock,
  sort_order  = excluded.sort_order;