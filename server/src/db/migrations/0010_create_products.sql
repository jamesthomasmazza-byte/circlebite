-- Local cache of Open Food Facts lookups, keyed by barcode. Consulted before every OFF call so
-- repeat scans are free and verdicts stay reproducible if the upstream record later changes
-- (docs/verdict-engine.md's pipeline step 1). `found = false` caches a confirmed not-found too,
-- distinct from "never looked up" — a bad or unknown barcode shouldn't hit OFF on every repeat.
--
-- allergens_tags/traces_tags are stored already normalized (strip "en:", lowercase, hyphens to
-- spaces) so the matcher never has to re-normalize on every match call.

CREATE TABLE products (
  barcode               TEXT PRIMARY KEY,
  found                 BOOLEAN NOT NULL,
  name                  TEXT,
  brand                 TEXT,
  ingredients_text      TEXT,
  allergens_tags        TEXT[] NOT NULL DEFAULT '{}',
  traces_tags           TEXT[] NOT NULL DEFAULT '{}',
  raw_data              JSONB,
  product_last_updated  TIMESTAMPTZ,
  fetched_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
