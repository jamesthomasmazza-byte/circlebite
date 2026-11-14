-- Product photos (JT's Snacks mockup, Nov 14): Open Food Facts' front image URLs, small for a list row
-- and full for an item's page, saved with the product when it is looked up (lib/productLookup.ts) or
-- found by the text search (routes/snackSearch.ts). Nullable: existing rows get theirs on their next
-- lookup after the 24-hour cache (no backfill, JT's call); the judge seed's invented products never
-- have one and draw a placeholder. Old code never reads these, so a symlink rollback past this
-- migration still works (docs/server-setup.md §9).

ALTER TABLE products
  ADD COLUMN image_front_small_url TEXT,
  ADD COLUMN image_front_url       TEXT;
