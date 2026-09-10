-- docs/verdict-engine.md's schema-additions section. source distinguishes how the scan was
-- initiated (barcode is the only one this slice produces; label_photo/manual are future paths).
-- confidence is nullable: a scan that never ran the AI reasoning step has no confidence band to
-- report, deterministic-only verdicts aren't scored that way.

ALTER TABLE scans
  ADD COLUMN source TEXT NOT NULL DEFAULT 'barcode' CHECK (source IN ('barcode', 'label_photo', 'manual')),
  ADD COLUMN confidence TEXT CHECK (confidence IN ('high', 'medium', 'low'));
