-- A correction is evidence about a product/model, not about the scan that happened to surface it
-- — docs/principles.md N17: corrections must be standalone, self-sufficient records. scan_id
-- CASCADE meant the 24-month scan-retention job (docs/coppa.md §2.7) and account deletion would
-- silently take the corrections corpus down with the scan history it was reporting on, including
-- corroborated community reports other profiles are relying on. Every field a correction needs to
-- stand on its own is already denormalized at write time (verdict_at_report, model_at_report,
-- prompt_version_at_report, source_text_at_report — recordCorrection.ts), and the corroboration/
-- community-additions queries key off barcode/allergen/direction, never scan_id, so this has no
-- read-path fallout. What it does cost: GET /scans/:scanId/corrections/:id/photo matches on
-- scan_id, so a correction's photo becomes unreachable through the app once its scan is purged,
-- even though the row and the file still exist (docs/coppa.md §2.7).

ALTER TABLE product_corrections ALTER COLUMN scan_id DROP NOT NULL;

ALTER TABLE product_corrections DROP CONSTRAINT product_corrections_scan_id_fkey;
ALTER TABLE product_corrections
  ADD CONSTRAINT product_corrections_scan_id_fkey
  FOREIGN KEY (scan_id) REFERENCES scans(id) ON DELETE SET NULL;
