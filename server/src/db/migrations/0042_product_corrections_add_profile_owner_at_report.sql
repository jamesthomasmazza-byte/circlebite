-- The owner of the profile a report was filed from — the family it came from. Corroboration counts
-- families, not reporters (recordCorrection.ts): an owner and a co-manager of the same child are one
-- household looking at one package, and counting them as two is the same mistake as the review queue
-- once showing one reporter as two pseudonyms. A follower's report counts toward the family whose
-- child they scanned for, since that is the package they were holding.
--
-- Snapshotted at write time (the N17 precedent), not joined at count time: scan_id goes NULL when
-- the scan is deleted (migration 0020 — retention, the judge seed reset), and the report must still
-- count as the family it came from. ON DELETE SET NULL, like reported_by: when the owner deletes
-- their account the report stays as evidence and counts as its reporter instead (recordCorrection.ts
-- COALESCEs the two).
--
-- Backfill from the scan's profile where the scan still exists. That is today's owner, not
-- necessarily the owner at report time — a profile transferred on account deletion (coppa.md §2.6)
-- reads as its new owner's. Existing statuses are NOT recomputed: a claim corroborated under the old
-- threshold stays corroborated until someone reviews it.

ALTER TABLE product_corrections
  ADD COLUMN profile_owner_at_report UUID REFERENCES users(id) ON DELETE SET NULL;

UPDATE product_corrections c
   SET profile_owner_at_report = p.manager_id
  FROM scans s
  JOIN allergen_profiles p ON p.id = s.allergen_profile_id
 WHERE s.id = c.scan_id;
