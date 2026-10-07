-- Every correction that names an allergen has both keys (migration 0043); wrong_product, which names
-- none, has neither. A keyless report counts toward no claim, so it would silently never help a
-- warning spread.
--
-- A separate migration, shipped in a LATER deploy than 0043, on purpose: release.sh migrates before
-- it swaps the symlink, so this constraint must not exist while the release that doesn't write the
-- keys is still serving. Deploy 0043 and the code that writes the keys first; this one after.
--
-- Rows written in that window — by the previous release, after 0043's own backfill ran — have no
-- keys, and that is expected, not an error: the deploy itself creates them. So this runs 0043's
-- backfill first (deterministic, idempotent, fills only missing keys, and tested against
-- allergenFoldKey/allergenFamilyKey). The same holds for anyone applying these migrations later
-- with real traffic in between.
--
-- Then it refuses, loudly, only if a row STILL has no key — something the backfill couldn't fill,
-- which nothing expected can produce and is worth stopping a deploy for. Failing here aborts
-- release.sh before the symlink swap (its `set -euo pipefail`), so the running release is untouched.

SELECT product_corrections_backfill_allergen_keys();

DO $$
DECLARE
  v_missing integer;
BEGIN
  SELECT count(*) INTO v_missing
    FROM product_corrections
   WHERE allergen IS NOT NULL AND (allergen_fold_key IS NULL OR allergen_family_key IS NULL);
  IF v_missing > 0 THEN
    RAISE EXCEPTION '% product_corrections row(s) name an allergen but still have no allergen key after the backfill', v_missing
      USING HINT = 'product_corrections_backfill_allergen_keys() (migration 0043) left them unfilled — find out why before requiring keys.';
  END IF;
END
$$;

ALTER TABLE product_corrections
  ADD CONSTRAINT product_corrections_allergen_keys_present
  CHECK ((allergen IS NULL) = (allergen_fold_key IS NULL) AND (allergen IS NULL) = (allergen_family_key IS NULL));
