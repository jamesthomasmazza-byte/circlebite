-- Adaptive scan flow, product-mismatch check (docs/verdict-engine.md Path D): before a photographed
-- label is allowed to merge into a barcode scan's verdict, its extracted product name is compared
-- against the scanned product's own name. label_extractions is the extraction call's own
-- reproducibility record (migration 0025's own comment), so the comparison outcome belongs here,
-- not on scans — it's a fact about this specific extraction call, not about the scan overall.
--
-- matched_product_identity is nullable on purpose: null means there was nothing to compare (no OFF
-- name, or the label itself had no visible product name), not "checked and it matched."
--
-- identity_confirmed_by_user is set only when matched_product_identity is false and the user was
-- asked to decide: true for "same product, use my photo anyway," false for "different product."
-- Recorded rather than only acted on — a barcode that repeatedly gets overridden this way is itself
-- a signal that the underlying Open Food Facts name is wrong, not that photos keep missing.

ALTER TABLE label_extractions
  ADD COLUMN matched_product_identity BOOLEAN,
  ADD COLUMN identity_mismatch_note TEXT,
  ADD COLUMN identity_confirmed_by_user BOOLEAN;
