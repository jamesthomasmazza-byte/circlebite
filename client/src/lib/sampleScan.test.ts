import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { isSampleScan, SAMPLE_BARCODE, wantsSample } from "./sampleScan";

const SCAN = readFileSync(new URL("../routes/Scan.tsx", import.meta.url), "utf8");
const HISTORY = readFileSync(new URL("../routes/ScanHistory.tsx", import.meta.url), "utf8");

// The guided setup's sample scan (2026-10-27).

test("the sample is one fixed synthetic barcode, matched exactly, never by prefix", () => {
  assert.equal(SAMPLE_BARCODE, "2990000000021");
  assert.equal(isSampleScan("2990000000021"), true);
  assert.equal(isSampleScan("2990000000014"), false, "another seeded product isn't the sample");
  assert.equal(isSampleScan(null), false);
});

test("Scan runs the sample only on the flag, for the profile asked for, and never reads a barcode from the URL", () => {
  assert.equal(wantsSample("?profile=p1&sample=1"), true);
  assert.equal(wantsSample("?profile=p1&sample=2990000000014"), false);
  assert.match(SCAN, /if \(!profileId \|\| profileId !== requestedProfile\(search\)\) return;/);
  assert.match(SCAN, /void runScan\(SAMPLE_BARCODE, profileId\);/);
  assert.doesNotMatch(SCAN, /get\("barcode"\)|searchParams\.get/);
});

test("a sample is said in words above the card, and has no 'report a problem'", () => {
  assert.match(SCAN, /\{isSampleScan\(result\.barcode\) && \(\s*<p className="sample-scan" role="note">/);
  assert.match(SCAN, /\{!reportOutcome && !isSampleScan\(result\.barcode\) && \(/);
  assert.match(HISTORY, /\{isSampleScan\(scan\.barcode\) && <span className="sample-scan__tag">\{HISTORY_SAMPLE_TAG\}<\/span>\}/);
});
