-- Run once in the SQL Editor of your Neon project before deploying.
CREATE TABLE IF NOT EXISTS catalogmint_catalogs (
  visitor_hash text NOT NULL,
  catalog_key text NOT NULL,
  website text NOT NULL,
  imported_at timestamptz NOT NULL,
  product_count integer NOT NULL CHECK (product_count >= 0),
  catalog jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (visitor_hash, catalog_key),
  CHECK (jsonb_typeof(catalog) = 'object'),
  CHECK (jsonb_typeof(catalog -> 'products') = 'array')
);
CREATE INDEX IF NOT EXISTS catalogmint_catalogs_history
  ON catalogmint_catalogs (visitor_hash, updated_at DESC);
