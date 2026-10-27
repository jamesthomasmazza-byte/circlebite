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

test("on Scan the camera is the one primary button; the typed-barcode submit is outlined", () => {
  const html = renderToStaticMarkup(createElement(BarcodeScanner, { onDetected: () => {} }));
  assert.match(html, /<button type="button" class="button-primary">Scan with camera<\/button>/);
  const form = SCAN.slice(SCAN.indexOf("<form onSubmit={handleSubmit}>"), SCAN.indexOf("</form>", SCAN.indexOf("<form onSubmit={handleSubmit}>")));
  assert.match(form, /<button type="submit" className="button-secondary"/);
  assert.equal(SCAN.match(/button-primary/g), null, "Scan.tsx adds no other primary button");
});

// A landscape phone (2026-10-26): "Scan with camera", the offer and Stop camera clear of the tab bar.

const CSS = readFileSync(new URL("./styles.css", import.meta.url), "utf8");

test("the camera scrolls into view after it renders, not from startCamera", () => {
  assert.doesNotMatch(body(SCANNER, "  async function startCamera()"), /scrollIntoView/);
  assert.match(SCANNER, /useEffect\(\(\) => \{\n    if \(cameraActive\) containerRef\.current\?\.scrollIntoView\(\{ block: "start" \}\);\n  \}, \[cameraActive\]\);/);
});

test("it scrolls again once the video knows its size, so a tall portrait frame can't leave Stop camera under the bar", () => {
  const effect = body(SCANNER, "  useEffect(() => {\n    const video = videoRef.current;");
  assert.match(effect, /if \(!cameraActive \|\| !video\) return;/);
  for (const event of ["loadedmetadata", "resize"]) {
    assert.match(effect, new RegExp(`video\\.addEventListener\\("${event}", scroll\\)`));
    assert.match(effect, new RegExp(`video\\.removeEventListener\\("${event}", scroll\\)`));
  }
  assert.match(effect, /containerRef\.current\?\.scrollIntoView\(\{ block: "start" \}\)/);
  for (const fn of ["  function stopCamera()", "  async function startCamera()"]) {
    assert.doesNotMatch(body(SCANNER, fn), /loadedmetadata|addEventListener/, `${fn} unchanged`);
  }
});

test("in a landscape phone Scan's heading gives way and the camera sits beside 'Scanning for'", () => {
  const landscape = CSS.slice(CSS.indexOf("@media (orientation: landscape) and (max-height: 500px)"));
  assert.match(landscape, /\.scan-title \{[^}]*clip: rect\(0 0 0 0\)/, "off screen, still read");
  assert.match(landscape, /\.scan-target \{[^}]*display: grid/);
  assert.match(landscape, /\.scan-target > \.scanner-section \{[^}]*grid-column: 2/);
  assert.match(landscape, /\.scan-target:has\(\.scanner\[data-active="true"\]\) > \.scanner-section \{[^}]*grid-column: 1 \/ -1/);
  assert.match(SCAN, /<h1 className="scan-title">Scan a product<\/h1>/);
  const target = SCAN.slice(SCAN.indexOf('<div className="scan-target">'), SCAN.indexOf("</div>", SCAN.indexOf('<div className="scan-target">')));
  assert.match(target, /Scanning for[\s\S]*<BarcodeScanner/);
});

// Decoding only inside the box, behind SCANNER_REGION (2026-10-27).

const REGION_READER = readFileSync(new URL("./boxRegionReader.ts", import.meta.url), "utf8");

test("only which reader is created depends on region; off, it's the plain whole-frame reader", () => {
  assert.match(SCANNER, /region = false,/, "off unless asked for");
  assert.match(SCANNER, /const reader = region\s*\? new BoxRegionReader\([\s\S]*?\)\s*: new BrowserMultiFormatReader\(\);/);
  assert.equal(SCANNER.match(/decodeFromVideoDevice\(/g)?.length, 1, "the camera opens one way in both modes");
  assert.match(SCANNER, /decodeFromVideoDevice\(undefined, videoRef\.current!, \(detected\) => \{/);
  assert.doesNotMatch(body(SCANNER, "  function stopCamera()"), /region|Region/);
});

test("the region reader replaces one step, decoding a frame, and leaves the camera to zxing", () => {
  assert.match(REGION_READER, /extends BrowserMultiFormatReader/);
  assert.equal(REGION_READER.match(/override /g)?.length, 1);
  assert.match(REGION_READER, /override decodeFromCanvas\(canvas: HTMLCanvasElement\): Result/);
  assert.doesNotMatch(REGION_READER, /getUserMedia|decodeFromVideoDevice|decodeFromStream|\bscan\(|\.stop\(/);
  assert.match(REGION_READER, /return super\.decodeFromCanvas\(this\.crop\);/);
  assert.doesNotMatch(REGION_READER, /super\.decodeFromCanvas\(canvas\)/, "never the whole frame");
});

test("an unmeasurable box is 'not found', so zxing's loop tries again", () => {
  assert.match(REGION_READER, /if \(!region\) throw new NotFoundException\(/);
  assert.match(REGION_READER, /import \{ NotFoundException, type Result \} from "@zxing\/library";/);
});

test("the region reader measures the same box the person sees", () => {
  assert.match(SCANNER, /<div ref=\{boxRef\} className="scanner__box" aria-hidden="true">/);
  assert.match(SCANNER, /videoRef\.current && boxRef\.current \? \{ video: videoRef\.current, box: boxRef\.current \} : null/);
});

test("Scan decodes inside the box from SCANNER_REGION, or an admin's override on this device", () => {
  assert.match(SCAN, /region=\{scannerRegionOn\(scannerRegionEnabled, user\?\.isAdmin === true, readOverride\(\)\)\}/);
});
