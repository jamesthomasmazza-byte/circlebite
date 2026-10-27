// The guided setup's "Try a sample scan" (2026-10-27): one real scan, through POST /scans, of one
// fixed synthetic product — the judge seed's Crunchy Peanut Bar (server db/seed/seedData.ts). It has
// structured allergen tags, so the AI step never runs: no cost, nothing in the AI accuracy report.
// The seeded row is never refreshed from Open Food Facts (server lib/productLookup.ts).
//
// Matched by this exact barcode, never by its 299 prefix: in-store items can use 2xx barcodes.

export const SAMPLE_BARCODE = "2990000000021";

export function isSampleScan(barcode: string | null | undefined): boolean {
  return barcode === SAMPLE_BARCODE;
}

/** Scan runs the sample only on this flag: a barcode is never read from the URL. */
export function wantsSample(search: string): boolean {
  return new URLSearchParams(search).get("sample") === "1";
}

export const SAMPLE_LABEL = "Sample scan: a made-up product, not a real one.";

export const HISTORY_SAMPLE_TAG = "Sample";
