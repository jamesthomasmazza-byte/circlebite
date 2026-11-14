-- Snack carts (docs/snack-list-plan.md addendum part B, 2026-11-14): a manager can link an item to
-- the exact Amazon product by pasting its amazon.com link. The server keeps only the ASIN (ten
-- characters, A–Z and digits, from /dp/<ASIN> or /gp/product/<ASIN>; snackList/amazonLink.ts) — never
-- the pasted URL, which can carry tracking. A linked item's "Shop on Amazon" goes to that product, and
-- "Add selected to Amazon cart" uses the ASINs. amazon_linked_by SET NULL: audit only, like added_by.
--
-- Nullable columns with defaults: old code never reads them, so a symlink rollback past this
-- migration still works (docs/server-setup.md §9).

ALTER TABLE snack_list_items
  ADD COLUMN amazon_asin       TEXT CHECK (amazon_asin IS NULL OR amazon_asin ~ '^[A-Z0-9]{10}$'),
  ADD COLUMN amazon_linked_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN amazon_linked_at  TIMESTAMPTZ;
