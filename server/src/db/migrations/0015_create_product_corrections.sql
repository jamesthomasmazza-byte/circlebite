-- A circle member disputing a verdict — docs/legacy-spec.md §6, extended per docs/verdict-engine.md
-- and CONTEST_RULES.md §3 to be able to target the AI's own verdict, not just the product data.
--
-- scan_id CASCADE: a correction is meaningless without the scan it's about, same reasoning as
-- verdict_explanations.scan_id. reported_by SET NULL: audit-only, the reporter's account being
-- deleted later must not erase the correction itself — it's evidence about the product/model, not
-- about the reporter.
--
-- target/verdict_explanation_id: 'ai_verdict' + the scan's verdict_explanations row when the
-- allergen being corrected was aiEscalated:true on that scan (a specific, traceable AI claim);
-- 'off_data' + null when it came from the deterministic matcher (disputing the underlying product
-- data — the only mode the original prototype had). wrong_product is always off_data.
--
-- verdict_at_report/model_at_report/prompt_version_at_report/source_text_at_report are
-- deliberately denormalized, not left to a join — docs/principles.md's N17 precedent: corrections
-- must be standalone, self-sufficient records. If a verdict_explanations row is ever pruned later,
-- the correction itself must still say what it was disputing and why.
--
-- allergen is nullable: wrong_product clears the whole scan, not one allergen.
--
-- The two unique indexes below are the same anti-inflation protection legacy-spec's
-- product_confirmations has: one user can't corroborate their own claim twice by reporting the
-- same (barcode, allergen, direction) more than once. Split into two indexes rather than one
-- UNIQUE(...) table constraint deliberately: a standard SQL UNIQUE treats NULL as distinct from
-- itself, so wrong_product reports (allergen always NULL) would silently bypass a single
-- constraint — every NULL row would compare as "different" from every other NULL row. Postgres 15+
-- has NULLS NOT DISTINCT for this, but the deployed box's Postgres version (installed via plain
-- `apt install postgresql`, not pinned) isn't confirmed to be 15+, so this uses the
-- version-portable partial-index form instead.

CREATE TABLE product_corrections (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scan_id                   UUID NOT NULL REFERENCES scans(id) ON DELETE CASCADE,
  barcode                   TEXT NOT NULL,
  reported_by               UUID REFERENCES users(id) ON DELETE SET NULL,
  correction_type           TEXT NOT NULL CHECK (correction_type IN ('flag_wrong', 'flag_missing', 'wrong_product')),
  direction                 TEXT NOT NULL CHECK (direction IN ('add_caution', 'remove_caution')),
  allergen                  TEXT,
  target                    TEXT NOT NULL CHECK (target IN ('off_data', 'ai_verdict')),
  verdict_explanation_id    UUID REFERENCES verdict_explanations(id) ON DELETE SET NULL,
  verdict_at_report         TEXT NOT NULL,
  model_at_report           TEXT,
  prompt_version_at_report  TEXT,
  source_text_at_report     TEXT,
  note                      TEXT,
  photo_path                TEXT NOT NULL,
  status                    TEXT NOT NULL CHECK (status IN ('pending', 'corroborated', 'rejected')) DEFAULT 'pending',
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX product_corrections_scan_idx ON product_corrections(scan_id);
-- Supports the corroboration-count query: how many distinct users have reported this same claim
-- about this barcode. Also doubles as the anti-inflation protection for flag_wrong/flag_missing
-- (allergen IS NOT NULL) — see the migration-level comment above for why this is split from the
-- wrong_product case below instead of one UNIQUE(...) constraint.
CREATE UNIQUE INDEX product_corrections_no_dup_allergen_report_idx
  ON product_corrections(barcode, allergen, direction, reported_by)
  WHERE allergen IS NOT NULL;

-- wrong_product's own anti-inflation protection: allergen is always NULL for this correction_type,
-- so it needs its own partial index rather than relying on the one above (which explicitly excludes
-- NULL allergen rows).
CREATE UNIQUE INDEX product_corrections_no_dup_wrong_product_report_idx
  ON product_corrections(barcode, direction, reported_by)
  WHERE allergen IS NULL;
