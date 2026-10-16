-- The profile a report was filed from — whose circle shares it while it's pending
-- (corrections/circleEscalations.ts). A pending escalation is shown to everyone who can read that
-- one profile, on every scan of the barcode (JT, 2026-10-13; profile-scoped, not family-scoped,
-- JT 2026-10-16): before a second family confirms it, a report is one person's unverified
-- observation, so it reaches the child whose package was in their hand and no other — not a
-- sibling's profile with the same owner.
--
-- profile_owner_at_report (0042) can't answer this: it names the family, and one owner can have
-- several children. scan_id can't either: it goes NULL when the scan is deleted (0020 — retention,
-- the judge seed reset), and the report must keep warning the circle after its scan is gone.
-- Snapshotted at write time for the same reason as 0042 (the N17 precedent).
--
-- ON DELETE SET NULL: a deleted profile has no circle left to show it to, and the report stays as
-- evidence about the product.
--
-- Nullable, with no constraint: release.sh migrates before it swaps the symlink, and the previous
-- release doesn't write this column (0043's reasoning). A row it writes in that window has a NULL
-- here and simply isn't shared — the reporter still sees it on their own scan, as today.
--
-- Backfill from the scan where it still exists. A report whose scan is already gone stays NULL:
-- guessing the profile from the owner would put it on the wrong child for an owner with two.

ALTER TABLE product_corrections
  ADD COLUMN allergen_profile_id_at_report UUID REFERENCES allergen_profiles(id) ON DELETE SET NULL;

UPDATE product_corrections c
   SET allergen_profile_id_at_report = s.allergen_profile_id
  FROM scans s
 WHERE s.id = c.scan_id;

-- The read is "this profile's pending escalations"; most reports are neither pending nor additions
-- for long, so the index only carries those.
CREATE INDEX product_corrections_pending_escalations_idx
  ON product_corrections (allergen_profile_id_at_report)
  WHERE status = 'pending' AND direction = 'add_caution';
