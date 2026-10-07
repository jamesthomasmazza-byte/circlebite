-- Every correction that names an allergen has both keys (migration 0043); wrong_product, which names
-- none, has neither. A keyless report counts toward no claim, so it would silently never help a
-- warning spread.
--
-- A separate migration, shipped in a LATER deploy than 0043, on purpose: release.sh migrates before
-- it swaps the symlink, so this constraint must not exist while the release that doesn't write the
-- keys is still serving. Deploy 0043 and the code that writes the keys first; this one after.
--
-- Fails loudly if any row is missing a key — never skips or quietly fills it. Such a row was
-- written by the previous release in the seconds between 0043 migrating and the symlink swap. The
-- fix is the frozen backfill 0043 left behind, which fills only missing keys; then deploy again.

DO $$
DECLARE
  v_missing integer;
BEGIN
  SELECT count(*) INTO v_missing
    FROM product_corrections
   WHERE allergen IS NOT NULL AND (allergen_fold_key IS NULL OR allergen_family_key IS NULL);
  IF v_missing > 0 THEN
    RAISE EXCEPTION '% product_corrections row(s) name an allergen but have no allergen key', v_missing
      USING HINT = 'Run SELECT product_corrections_backfill_allergen_keys(); then deploy again (migration 0044).';
  END IF;
END
$$;

ALTER TABLE product_corrections
  ADD CONSTRAINT product_corrections_allergen_keys_present
  CHECK ((allergen IS NULL) = (allergen_fold_key IS NULL) AND (allergen IS NULL) = (allergen_family_key IS NULL));
