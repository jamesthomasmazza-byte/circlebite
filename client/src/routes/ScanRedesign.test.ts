import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

// The redesigned Scan tab (JT's mockup, 2026-11-06, behind SCAN_REDESIGN): a layout of the same
// Scan. Scan fetches on mount, so these read the source; the rules are lib/scanRedesign.test.ts's.

const SCAN = readFileSync(new URL("./Scan.tsx", import.meta.url), "utf8");

test("switch off is today's Scan: its own select and line, the photo button, nothing hidden", () => {
  assert.match(SCAN, /const redesign = scanRedesignEnabled;/);
  assert.match(SCAN, /\{!redesign && \(\s*<>\s*<label>\s*Scanning for\s*<select value=\{profileId\} onChange=\{\(e\) => chooseProfile\(e\.target\.value\)\}>/);
  assert.match(SCAN, /hidden=\{redesign && mode !== "barcode"\}/);
  assert.match(SCAN, /hidden=\{redesign && mode !== "type"\}/);
  assert.match(SCAN, /\{labelScanEnabled && !photoCaptureOpen && !redesign && \(/);
  // Every redesign-only block is behind the switch.
  for (const block of ["<section className=\"scan-recent\"", "<div className=\"scan-modes\""]) {
    const at = SCAN.indexOf(block);
    assert.ok(at > 0, block);
    assert.match(SCAN.slice(SCAN.lastIndexOf("{redesign &&", at), at), /^\{redesign &&/, block);
  }
});

test("one scanner either way: the stage is the same BarcodeScanner, kept mounted for Scan another", () => {
  assert.equal(SCAN.match(/<BarcodeScanner\b/g)?.length, 1);
  assert.match(SCAN, /<BarcodeScanner\s+ref=\{scannerRef\}\s+onBusyChange=\{setScannerBusy\}\s+stage=\{redesign\}/);
});

test("Recent: the chosen profile's last three, read again after each result, with the short disclaimer and 911", () => {
  assert.match(SCAN, /getScanHistory\(profileId\)\s*\.then\(\(history\) => live && setRecent\(recentCards\(profileId, history\)\)\)/);
  assert.match(SCAN, /\}, \[redesign, profileId, result\?\.id\]\);/);
  const recent = SCAN.slice(SCAN.indexOf('<section className="scan-recent"'), SCAN.indexOf("</section>", SCAN.indexOf('<section className="scan-recent"')));
  assert.match(recent, /\{DISCLAIMER_SHORT\} \{EMERGENCY\}/);
  assert.match(recent, /<span className="scan-recent__label">\{r\.label\}<\/span>/);
});

test("the segmented control: leaving Barcode stops the camera; Label photo opens today's photo form", () => {
  const choose = SCAN.slice(SCAN.indexOf("function chooseMode("), SCAN.indexOf("// Shared between the barcode flow"));
  assert.match(choose, /if \(next !== "barcode"\) scannerRef\.current\?\.stop\(\);/);
  assert.match(choose, /if \(next === "photo"\) openStandalonePhotoCapture\(\);/);
  assert.match(SCAN, /scanModes\(labelScanEnabled\)\.map/);
});
