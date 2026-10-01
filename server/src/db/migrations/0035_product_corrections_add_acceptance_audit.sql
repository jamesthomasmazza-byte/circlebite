-- An admin accepting a re-filed report (migration 0034) from the review queue. A re-file is held out
-- of corroboration until someone looks at its new evidence; accepting it is the review that lets it
-- count again. Without this, a re-file could only ever reach other families if independent reporters
-- happened to corroborate the same claim — the reporter who noticed a reformulation first would have
-- no path at all.
--
-- Accepting restores the report's vote; it doesn't override the threshold. recordCorrection.ts's
-- corroborateClaimIfThresholdMet counts an accepted re-file like any other report, so an accepted
-- add_caution corroborates (threshold 1) and an accepted remove_caution still needs three reporters
-- and still yields to a corroborated warning (docs/principles.md principle 1).
--
-- Same shape and reasoning as the rejection audit (migration 0023, principle 4): an action that
-- changes what other families are shown records who took it and when. accepted_by is ON DELETE SET
-- NULL like rejected_by — the acceptance outlives the admin's account. Both nullable: almost no row
-- is ever a re-file, let alone an accepted one.

ALTER TABLE product_corrections
  ADD COLUMN accepted_by UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN accepted_at TIMESTAMPTZ;
