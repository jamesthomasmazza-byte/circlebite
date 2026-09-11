-- A single boolean, not a role table or enum — nothing today needs more than "can see internal
-- aggregate stats." Flipped by hand via SQL on production (docs/server-setup.md), the same
-- "instead of a UI" pattern already used for product_corrections.status. No UI ever sets this.
--
-- Deliberately not granted to the judge account: with a small user base, per-allergen breakdowns
-- on the AI accuracy page can effectively identify a specific person's allergy (docs/principles.md
-- precedent table).

ALTER TABLE users ADD COLUMN is_admin BOOLEAN NOT NULL DEFAULT false;
