-- Every AI reasoning attempt, success or failure, for a scan (docs/verdict-engine.md's
-- verdict_explanations table). CASCADE on scan_id: an explanation is meaningless without the scan
-- it explains, same reasoning as scans' own allergen_profile_id FK.
--
-- Stored even when the model call failed (findings/unresolved_terms empty, cost/tokens null) —
-- rule 8 (every verdict reproducible) applies to fail-closed outcomes too, and the accuracy report
-- planned for week 8 needs failed attempts visible, not just successful ones.
--
-- findings/unresolved_terms are the *validated* output (post span-check), not the model's raw
-- response — a discarded finding never reaches storage any more than it reaches the screen.

CREATE TABLE verdict_explanations (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scan_id           UUID NOT NULL REFERENCES scans(id) ON DELETE CASCADE,
  model             TEXT NOT NULL,
  prompt_version    TEXT NOT NULL,
  verdict           TEXT NOT NULL CHECK (verdict IN ('safe', 'contains_allergen', 'may_contain_caution', 'unable_to_confirm')),
  confidence        TEXT NOT NULL CHECK (confidence IN ('high', 'medium', 'low')),
  findings          JSONB NOT NULL DEFAULT '[]',
  unresolved_terms  JSONB NOT NULL DEFAULT '[]',
  latency_ms        INTEGER,
  tokens_in         INTEGER,
  tokens_out        INTEGER,
  cost_cents        NUMERIC,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX verdict_explanations_scan_idx ON verdict_explanations(scan_id);
-- Supports the daily spend-cap check (sum cost_cents for "today") without a table scan.
CREATE INDEX verdict_explanations_created_at_idx ON verdict_explanations(created_at);
