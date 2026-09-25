-- Path C (docs/verdict-engine.md) covers "no barcode, or product absent entirely" — the standalone
-- entry point (loose produce, torn packaging, homemade food) never has a barcode to record at all.
-- scans.source already accepts 'label_photo' (migration 0013); this is what lets that source
-- actually be used without a barcode. A barcode-known Path C scan (the reactive entry point — a
-- barcode was scanned but Open Food Facts had no record or a thin one) still writes its barcode
-- here as before; only the truly barcode-less case leaves this NULL.

ALTER TABLE scans ALTER COLUMN barcode DROP NOT NULL;
