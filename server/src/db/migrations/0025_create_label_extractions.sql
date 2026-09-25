-- Path C (docs/verdict-engine.md): every attempt to transcribe a photographed ingredients label,
-- success or failure alike — the extraction-call analogue of verdict_explanations (migration 0012),
-- kept as its own table rather than folded into that one because its output shape doesn't fit:
-- verdict_explanations is verdict-shaped (verdict/confidence/findings), this is transcription-shaped
-- (ingredients_text/contains/may_contain/legible/complete). Conflating "the model read a photo" with
-- "the model reasoned about allergens" in one row would also make the AI accuracy report's
-- per-call-type breakdown impossible to build cleanly.
--
-- No image_path column, on purpose — the photo itself is never stored (docs/verdict-engine.md Path
-- C plan: "process and discard the photo"). Only the extracted text and the call's own metadata
-- persist, for the same reproducibility reason (rule 8) verdict_explanations already exists for: a
-- wrong verdict downstream could stem from a bad extraction, and that has to be reconstructable on
-- its own, not just inferred from scans.ingredients_text after the fact.
--
-- complete/incomplete_reason are the load-bearing columns here, separate from legible: legible only
-- says whether what was captured could be read; complete says whether the *whole* ingredients
-- statement (including any "may contain" line) was actually in frame. A cut-off label that
-- transcribes cleanly is legible: true, complete: false — the dangerous case this table exists to
-- make visible, since a dropped allergen line otherwise leaves no trace anywhere downstream.
--
-- scan_id CASCADE, same reasoning as verdict_explanations.scan_id: an extraction record is
-- meaningless without the scan it fed, and this means the existing 24-month scan-retention job
-- (jobs/scanRetention.ts) purges these automatically along with the scan, no code change needed
-- there.

CREATE TABLE label_extractions (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scan_id            UUID NOT NULL REFERENCES scans(id) ON DELETE CASCADE,
  model              TEXT NOT NULL,
  prompt_version     TEXT NOT NULL,
  ingredients_text   TEXT,
  product_name       TEXT,
  contains           JSONB NOT NULL DEFAULT '[]',
  may_contain        JSONB NOT NULL DEFAULT '[]',
  legible            BOOLEAN,
  complete           BOOLEAN,
  incomplete_reason  TEXT,
  language           TEXT,
  failure_reason     TEXT,
  latency_ms         INTEGER,
  tokens_in          INTEGER,
  tokens_out         INTEGER,
  cost_cents         NUMERIC,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX label_extractions_scan_idx ON label_extractions(scan_id);
-- Supports the daily spend-cap check (spendGuard.ts unions cost_cents from this table with
-- verdict_explanations') without a table scan — same reasoning as
-- verdict_explanations_created_at_idx (migration 0012).
CREATE INDEX label_extractions_created_at_idx ON label_extractions(created_at);
