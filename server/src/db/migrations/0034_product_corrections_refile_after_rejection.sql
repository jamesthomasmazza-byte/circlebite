-- A rejected report no longer locks its reporter out of that claim for good. Migration 0015's two
-- anti-inflation indexes covered every row whatever its status, so once an admin rejected someone's
-- (barcode, allergen, direction) report, that person could never report it again — found live on
-- 2026-10-01, when a re-report of a rejected sesame claim hit the index. The indexes exist to stop
-- one person inflating corroboration by reporting the same claim repeatedly, and a rejected report
-- corroborates nothing (recordCorrection.ts excludes it from the count), so they now cover only live
-- rows: one live report per person per claim, as before; a rejected one no longer counts.
--
-- What that alone would have reopened: add_caution corroborates on its first report (threshold 1),
-- so a re-file would corroborate on insert and put the warning the admin just pulled back in front
-- of every family — one click undoing a review, as often as the reporter liked. So a re-file is new
-- evidence for an admin to look at, not a new vote. refiles_rejected_id links it to the rejected
-- report it follows (set by recordCorrection.ts at write time, denormalized per the N17 precedent),
-- and recordCorrection.ts leaves any row with it set out of the corroboration count. It still
-- overrides the reporter's own view immediately (CONTEST_RULES.md §3), and it still corroborates
-- along with everyone else's if independent reporters reach the threshold on their own. Otherwise it
-- reaches other families only when an admin accepts it from the review queue.
--
-- What this costs (docs/principles.md, Oct 1 2026 precedent): a true warning that someone re-files
-- after a product is reformulated waits for an admin before other families see it.
--
-- ON DELETE SET NULL: the rejected row is the history this one follows, but deleting it (there is no
-- path that does today) must not take the re-file with it.

DROP INDEX product_corrections_no_dup_allergen_report_idx;
CREATE UNIQUE INDEX product_corrections_no_dup_allergen_report_idx
  ON product_corrections(barcode, allergen, direction, reported_by)
  WHERE allergen IS NOT NULL AND status <> 'rejected';

DROP INDEX product_corrections_no_dup_wrong_product_report_idx;
CREATE UNIQUE INDEX product_corrections_no_dup_wrong_product_report_idx
  ON product_corrections(barcode, direction, reported_by)
  WHERE allergen IS NULL AND status <> 'rejected';

ALTER TABLE product_corrections
  ADD COLUMN refiles_rejected_id UUID REFERENCES product_corrections(id) ON DELETE SET NULL;
