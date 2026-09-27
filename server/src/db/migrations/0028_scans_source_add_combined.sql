-- Adaptive scan flow (docs/verdict-engine.md Path D): barcode data is kept even when a label photo
-- is also read, so the resulting scan and any correction filed against it carry a real product
-- identity. That's a genuinely new source, not "label_photo" (which today means barcode-less) and
-- not "barcode" (which today means no photo was read) — 'combined' says both were.
--
-- scans_source_check is the auto-generated name from migration 0013's inline column CHECK
-- (confirmed against the live schema before writing this, not assumed) — Postgres has no ALTER
-- CHECK, so the constraint has to be dropped and re-added rather than modified in place.

ALTER TABLE scans DROP CONSTRAINT scans_source_check;
ALTER TABLE scans ADD CONSTRAINT scans_source_check CHECK (source IN ('barcode', 'label_photo', 'manual', 'combined'));
