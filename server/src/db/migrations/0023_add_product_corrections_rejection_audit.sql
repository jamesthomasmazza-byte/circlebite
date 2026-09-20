-- The review queue (BACKLOG.md line 145) lets an admin reject one report from the UI instead of
-- the psql runbook in docs/server-setup.md §11, which only ever set `status = 'rejected'` by hand
-- with no record of who did it, when, or why. docs/principles.md principle 4: an action that
-- changes what other families are shown must be auditable before it ships. These three columns are
-- that audit trail.
--
-- rejected_by is nullable, ON DELETE SET NULL — matching reported_by's precedent (migration 0015):
-- if the rejecting admin's account is later deleted, the correction row and the fact that someone
-- rejected it must survive; it's evidence about the product/model, not about the admin.
--
-- rejection_reason is required only for a rejected add_caution report (the dangerous direction per
-- principle 1 — this is what removes a warning other families are currently being shown) and
-- optional for remove_caution. Enforced in reviewQueue.ts's rejectCorrection, not a CHECK
-- constraint here, matching how this table already leans on application logic for its other
-- status/direction-dependent invariants (verdict_explanation_id, target, the allergen-nullness
-- split between wrong_product and the other two correction types).
--
-- All three are nullable because most rows are never rejected.

ALTER TABLE product_corrections
  ADD COLUMN rejected_by      UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN rejected_at      TIMESTAMPTZ,
  ADD COLUMN rejection_reason TEXT;
