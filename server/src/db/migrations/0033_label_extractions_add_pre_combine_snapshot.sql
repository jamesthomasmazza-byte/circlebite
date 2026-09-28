-- Adaptive scan flow, mismatch-demotion follow-up (docs/verdict-engine.md Path D): removing the
-- blocking mismatch screen also removed the one place a user could say "that wasn't this product"
-- and have it mean something. This restores it as a non-blocking "discard the photo" action
-- (combineScan.ts's discardLabelEvidence) instead of an upfront gate.
--
-- Discarding has to revert the scan to its own pre-combine barcode-only verdict without recomputing
-- anything — rule 8 (every verdict reproducible), and no reason to spend on a fresh AI call for data
-- this app already had a moment earlier. These three columns are exactly the scans row as it stood
-- immediately before combineLabelScan's own UPDATE overwrote it, snapshotted at combine time so a
-- later discard can restore it with a plain UPDATE.
--
-- identity_confirmed_by_user (migration 0029) regains a real, current meaning here: it's set to
-- false when discardLabelEvidence runs for a row. It's never written true anymore — nothing asks
-- "same product?" and records an explicit yes; a combine that's never discarded just stands on its
-- own, the same as any other reconciled verdict. Existing rows from before this change keep their
-- original true/false values as history; new rows are null until (if ever) discarded.

ALTER TABLE label_extractions
  ADD COLUMN pre_combine_result TEXT,
  ADD COLUMN pre_combine_confidence TEXT,
  ADD COLUMN pre_combine_matched_allergens JSONB;
