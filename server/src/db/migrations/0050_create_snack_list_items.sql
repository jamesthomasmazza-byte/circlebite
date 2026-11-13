-- Snack lists (docs/snack-list-plan.md, 2026-11-13): each profile's list of products its owner and
-- co-managers approved from a scan's verdict card. One row per (profile, barcode): an item is one
-- exact barcode, never free text, so the matcher can run on it again later.
--
-- allergen_profile_id CASCADE: the list belongs to the profile (docs/coppa.md §2.6, as scans).
-- barcode CASCADE to products: the judge reseed deletes and recreates the seeded product rows
-- (db/seed/judgeSeed.ts), and an item with no product row has nothing to show or match against.
-- scan_id SET NULL: the scan the item was added from. Its stored per-allergen detail carries the
-- model's Path B escalations, which no product row holds (snackList/itemVerdict.ts). The scan
-- retention job deletes old scans (jobs/scanRetention.ts); the item stays, and the floor drops away.
-- added_by SET NULL: audit only, like scans.scanner_id — a deleted account mustn't empty a list.
--
-- Old code never reads this table, so a symlink rollback past this migration still works
-- (docs/server-setup.md §9).

CREATE TABLE snack_list_items (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  allergen_profile_id   UUID NOT NULL REFERENCES allergen_profiles(id) ON DELETE CASCADE,
  barcode               TEXT NOT NULL REFERENCES products(barcode) ON DELETE CASCADE,
  scan_id               UUID REFERENCES scans(id) ON DELETE SET NULL,
  added_by              UUID REFERENCES users(id) ON DELETE SET NULL,
  note                  TEXT CHECK (note IS NULL OR char_length(note) <= 200),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (allergen_profile_id, barcode)
);

CREATE INDEX snack_list_items_profile_created_idx ON snack_list_items(allergen_profile_id, created_at);
