import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { BarcodeScanner } from "./BarcodeScanner";
import { NO_READ_OFFER, NO_READ_OFFER_MS } from "./lib/scannerCopy";

// The label-photo offer when no barcode reads (2026-10-26): an offer, never an automatic switch.

const SCANNER = readFileSync(new URL("./BarcodeScanner.tsx", import.meta.url), "utf8");
const SCAN = readFileSync(new URL("./routes/Scan.tsx", import.meta.url), "utf8");

function body(source: string, start: string): string {
  const i = source.indexOf(start);
  assert.ok(i >= 0, `found ${start}`);
  return source.slice(i, source.indexOf("\n  }\n", i));
}

test("the offer's words and its 8 seconds", () => {
  assert.equal(NO_READ_OFFER, "Can't read the barcode? Photograph the ingredients label");
  assert.equal(NO_READ_OFFER_MS, 8000);
});

test("before the camera starts there's no offer, with or without the handler", () => {
  for (const props of [{ onDetected: () => {} }, { onDetected: () => {}, onOfferLabelPhoto: () => {} }]) {
    const html = renderToStaticMarkup(createElement(BarcodeScanner, props));
    assert.doesNotMatch(html, /Photograph the ingredients label/);
    assert.match(html, /Scan with camera/);
  }
});

test("the offer only shows while the camera runs and nothing has read", () => {
  const i = SCANNER.indexOf("{cameraActive ? (");
  const running = SCANNER.slice(i, SCANNER.indexOf(") : (", i));
  assert.match(running, /\{offerShown && !read && \(/);
});

test("the timer needs the handler, a running camera and no read, and starts over each time", () => {
  const effect = body(SCANNER, "  useEffect(() => {\n    setOfferShown(false);");
  assert.match(effect, /if \(!offerEnabled \|\| !cameraActive \|\| read\) return;/);
  assert.match(effect, /setTimeout\(\(\) => setOfferShown\(true\), NO_READ_OFFER_MS\)/);
  assert.match(effect, /clearTimeout\(timer\)/);
});

test("nothing in the camera code shows or times the offer: only a tap acts on it", () => {
  for (const fn of ["  function stopCamera()", "  async function startCamera()"]) {
    assert.doesNotMatch(body(SCANNER, fn), /offer|NO_READ/i, `${fn} doesn't touch the offer`);
  }
  assert.equal(SCANNER.match(/setOfferShown\(true\)/g)?.length, 1, "only the timer shows it");
  assert.equal(SCANNER.match(/onOfferLabelPhoto\?\.\(\)/g)?.length, 1, "only the button calls it");
});

test("tapping the offer stops the camera, then opens the photo flow; it never reports a read", () => {
  const i = SCANNER.indexOf("{NO_READ_OFFER}");
  const button = SCANNER.slice(SCANNER.lastIndexOf("<button", i), i);
  assert.match(button, /stopCamera\(\);\s*onOfferLabelPhoto\?\.\(\);/);
  assert.doesNotMatch(button, /onDetected/);
});

test("Scan offers it only with the label scan on, for the selected profile, and scrolls to the form", () => {
  const i = SCAN.indexOf("onOfferLabelPhoto={");
  const prop = SCAN.slice(i, SCAN.indexOf("/>", i));
  assert.match(prop, /labelScanEnabled\s*\?/);
  assert.match(prop, /: undefined/);
  // openStandalonePhotoCapture scans for profileId, the profile picked in "Scanning for".
  assert.match(prop, /openStandalonePhotoCapture\(\);\s*setScrollToPhotoForm\(true\);/);
  assert.match(SCAN, /<form ref=\{photoFormRef\} onSubmit=\{handlePhotoSubmit\}>/);
});
