-- Every scan performed. scanner_id is audit-only (SET NULL on delete, same reasoning as
-- invited_by/added_by in the weeks 2-3 migrations) — the scanner's account being deleted later
-- must not erase the *profile's* history, which is what this table really belongs to.
-- allergen_profile_id is CASCADE: deleting a profile deletes its scans (docs/coppa.md §2.6).
--
-- product_data is a raw snapshot at scan time, not just a reference to the products cache row —
-- the cache can be overwritten by a later, different lookup, but a scan's own record of what it
-- saw must stay reproducible.

CREATE TABLE scans (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scanner_id            UUID REFERENCES users(id) ON DELETE SET NULL,
  allergen_profile_id   UUID NOT NULL REFERENCES allergen_profiles(id) ON DELETE CASCADE,
  barcode               TEXT NOT NULL,
  product_name          TEXT,
  product_brand         TEXT,
  ingredients_text      TEXT,
  product_data          JSONB,
  product_last_updated  TIMESTAMPTZ,
  result                TEXT NOT NULL CHECK (result IN ('safe', 'contains_allergen', 'may_contain_caution', 'unable_to_confirm')),
  matched_allergens     JSONB NOT NULL DEFAULT '[]',
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX scans_profile_created_idx ON scans(allergen_profile_id, created_at DESC);
