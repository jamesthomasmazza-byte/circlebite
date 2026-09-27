-- Adaptive scan flow, label_looser disagreement (docs/verdict-engine.md Path D, docs/principles.md
-- Sept 27 2026 precedent): a label_looser row on the verdict card links straight into a pre-filled
-- flag_wrong correction. That correction is a remove_caution, and three of them corroborate and
-- remove the warning for every family that scans this barcode — so the prompt has to be grounded in
-- the parent's own reading of the physical package, never in the photo's silence (a photo's silence
-- can't clear an allergen on its own; it can't be allowed to launder that same weak evidence into a
-- removal just because it arrived through a human clicking submit).
--
-- This column is the audit trail that keeps that distinction visible downstream: the review queue
-- must be able to tell a report the app prompted for apart from one a user brought on their own,
-- since a cluster of prompted reports around one barcode reads very differently to a reviewer than
-- a cluster of spontaneous ones. It does not change corroboration counting — recordCorrection.ts's
-- threshold logic is unaffected — it only changes what the review queue can show.
--
-- Default 'user_initiated', not nullable: every correction has an origin, including every row that
-- predates this column (all of which were, in fact, user-initiated — nothing today prompts a
-- correction from within the app).

ALTER TABLE product_corrections
  ADD COLUMN origin TEXT NOT NULL DEFAULT 'user_initiated' CHECK (origin IN ('user_initiated', 'disagreement_prompt'));
