-- A product-level Amazon link (JT, Nov 14): one ASIN per product, shared across every family's list,
-- set and cleared by admins only (authorization/admin.ts — never a judge account) from an item's page.
-- A list item's own link (snack_list_items.amazon_asin, a manager's) still wins as an override; with
-- neither, the item's "Shop on Amazon" is the search as before. Same ten-character shape as the item
-- column; only the ASIN is ever stored, never a pasted URL. amazon_asin_set_by SET NULL: audit only.
-- Nullable; old code never reads these, so a symlink rollback past this migration still works.

ALTER TABLE products
  ADD COLUMN amazon_asin         TEXT CHECK (amazon_asin IS NULL OR amazon_asin ~ '^[A-Z0-9]{10}$'),
  ADD COLUMN amazon_asin_set_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN amazon_asin_set_at  TIMESTAMPTZ;
