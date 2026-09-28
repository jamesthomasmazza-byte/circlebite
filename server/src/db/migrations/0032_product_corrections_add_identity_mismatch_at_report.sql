-- Adaptive scan flow, mismatch-demotion follow-up (docs/verdict-engine.md Path D): a product-
-- identity mismatch no longer blocks a combine — it merges automatically and surfaces as an inline
-- note instead (combineScan.ts's combineLabelScan). reconcileEvidence.ts is escalate-only regardless
-- of identity match, so this never lets a mismatched label make a verdict less cautious. What it
-- doesn't protect against on its own is a mismatched label's data reaching the *shared* record: a
-- correction filed against a combined scan denormalizes that scan's verdict with no check today
-- (recordCorrection.ts), and one report is enough to corroborate an add_caution claim that then
-- changes what every other family scanning that barcode sees.
--
-- identity_mismatch_at_report is denormalized at write time, same reasoning recordCorrection.ts's
-- own doc comment already gives for verdict_at_report/model_at_report/etc: label_extractions
-- cascades with its scan (migration 0025) but a correction survives its scan being deleted
-- (migration 0020's SET NULL), so a live join back to label_extractions isn't reliably available for
-- this row's whole lifetime. recordCorrection.ts uses it to exclude a mismatched-label-sourced
-- correction from barcode-level corroboration — the same treatment a barcode-less Path C scan
-- already gets (migration 0027's own corroboration-skip), for the same reason: the correction row
-- itself still stands (still overrides the reporter's own view, still reviewable), only the
-- cross-family propagation is gated.
--
-- Backfilled, not just defaulted: the exposure this closes already happened. Before this change, the
-- only way label evidence reached a barcode scan despite a mismatch was the old confirmProductIdentity
-- "same_product" override (removed by this same change) — a correction filed against a scan that went
-- through it could already be sitting in this table, possibly already corroborated, possibly already
-- affecting what other families see for that barcode. Defaulting new rows to false while leaving
-- existing ones untouched would close the door going forward and leave it open for exactly the rows
-- that motivated closing it.

ALTER TABLE product_corrections
  ADD COLUMN identity_mismatch_at_report BOOLEAN NOT NULL DEFAULT false;

UPDATE product_corrections pc
SET identity_mismatch_at_report = true
FROM scans s
JOIN label_extractions le ON le.scan_id = s.id
WHERE pc.scan_id = s.id AND le.matched_product_identity = false;

-- Surfaced at migration time, not just left for someone to notice later: if any of the rows this
-- backfill just flagged had already reached 'corroborated' status, that's a warning that already
-- propagated to other families before this migration ran, and needs a human look (the review queue,
-- reviewQueue.ts, or a manual product_corrections query), not a silent flip of a column.
DO $$
DECLARE
  already_corroborated INTEGER;
BEGIN
  SELECT count(*) INTO already_corroborated
  FROM product_corrections
  WHERE identity_mismatch_at_report = true AND status = 'corroborated';

  IF already_corroborated > 0 THEN
    RAISE WARNING 'migration 0032: % correction row(s) with a mismatched-label scan were already corroborated before this backfill — review manually, this may already have changed what other families see for that barcode', already_corroborated;
  END IF;
END $$;
