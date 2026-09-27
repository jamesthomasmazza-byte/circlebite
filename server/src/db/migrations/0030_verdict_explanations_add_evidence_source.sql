-- Adaptive scan flow (docs/verdict-engine.md Path D): a combined scan can now produce TWO reasoning
-- calls against the same scan_id — one reasoning over the barcode's own ingredient text (Path B),
-- one reasoning over the photographed label's extracted text (Path C) — where every scan before
-- this had at most one. verdict/aiAccuracyReport.ts's fetchEscalationRows currently joins
-- verdict_explanations to each scan via "ORDER BY created_at DESC LIMIT 1", which silently
-- attributes every escalation on a combined scan to whichever call happened to run second (always
-- the label-side one, chronologically) — including an escalation that actually came from the
-- barcode-side call. This column lets that join match each per-allergen finding to the reasoning
-- call that actually produced it instead of guessing from recency.
--
-- Nullable: every row before this migration, and every non-combined scan's row after it, has
-- exactly one reasoning call and no ambiguity to resolve.

ALTER TABLE verdict_explanations
  ADD COLUMN evidence_source TEXT CHECK (evidence_source IN ('barcode', 'label'));
