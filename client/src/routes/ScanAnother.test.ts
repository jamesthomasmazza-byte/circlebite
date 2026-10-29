import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { createElement, createRef } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { BarcodeScanner, type BarcodeScannerHandle } from "../BarcodeScanner";
import { SCAN_ANOTHER } from "../lib/scannerCopy";

// "Scan another product" (2026-10-29): pinned just above the tab bar whenever a result is on
// screen, so the next scan is one tap from anywhere on it — never covering the verdict, the
// screening-aid and 911 note, or "Report a problem", and never opening the camera by itself.

const SCAN = readFileSync(new URL("./Scan.tsx", import.meta.url), "utf8");
const SCANNER = readFileSync(new URL("../BarcodeScanner.tsx", import.meta.url), "utf8");
const CSS = readFileSync(new URL("../styles.css", import.meta.url), "utf8");

function between(source: string, start: string, end: string): string {
  const i = source.indexOf(start);
  assert.ok(i >= 0, `found ${start}`);
  return source.slice(i, source.indexOf(end, i));
}

test("the words", () => {
  assert.equal(SCAN_ANOTHER, "Scan another product");
});

test("it shows over a result, the sample's, a label photo's and 'couldn't read this label' — not over an open report or the required photo", () => {
  const condition = between(SCAN, "const showScanAnother =", ";\n");
  assert.match(condition, /!scannerBusy && !reportOpen && \(couldntReadLabel \|\| Boolean\(result && shown && !awaitingRequiredPhoto\)\)/);
  // No sample or source exception: the sample's card and a label photo's are results like any other.
  assert.doesNotMatch(condition, /isSampleScan|source/);
});

test("it renders after both result sections, at the end of the page, pinned", () => {
  const pinned = SCAN.indexOf('<div className="scan-another">');
  assert.ok(pinned > SCAN.indexOf("Report a problem with this verdict\n"), "after the verdict section");
  assert.ok(pinned > SCAN.indexOf("{couldntReadHeading("), "after the couldn't-read section");
  assert.match(SCAN.slice(pinned - 40, pinned), /\{showScanAnother && \(/);
});

test("its tap calls the scanner's start() and nothing else, synchronously", () => {
  assert.match(SCAN, /<button type="button" className="button-primary" onClick=\{\(\) => scannerRef\.current\?\.start\(\)\}>\s*\{SCAN_ANOTHER\}/);
  assert.equal(SCAN.match(/\.start\(\)/g)?.length, 1, "start() is called from that one click only");
  assert.match(SCAN, /<BarcodeScanner\s+ref=\{scannerRef\}\s+onBusyChange=\{setScannerBusy\}/);
});

test("start() scrolls the scanner into view, then takes the button's own path to the camera", () => {
  const start = between(SCANNER, "    start() {", "\n    },");
  assert.match(start, /if \(cameraActive\) return;/);
  assert.match(start, /scrollIntoView\(\{ block: "start", behavior: revealBehavior\(prefersReducedMotion\(\)\) \}\);[\s\S]*requestCamera\(\);/);
  assert.doesNotMatch(start, /startCamera/, "never around the camera sentence");
  assert.match(SCANNER, /function requestCamera\(\) \{\s*if \(cameraPrimerSeen\(\)\) void startCamera\(\);\s*else setPrimerOpen\(true\);\s*\}/);
});

test("the camera never opens by itself: only a tap reaches startCamera", () => {
  // requestCamera (the button, and start() from Scan's button) and the sentence's Continue.
  assert.equal(SCANNER.match(/void startCamera\(\)/g)?.length, 2);
  assert.match(between(SCANNER, "onClick={() => {\n                  markCameraPrimerSeen();", "}}"), /void startCamera\(\)/);
  for (const effect of SCANNER.split("useEffect(").slice(1)) {
    const body = effect.slice(0, effect.search(/\n {2}\}, \[|\[\]\);/)).replace(/\/\/.*$/gm, "");
    assert.doesNotMatch(body, /startCamera|requestCamera|\.start\(/, "no effect starts the camera");
  }
});

test("the sentence opened from the pinned button takes focus, so a screen reader follows the tap", () => {
  assert.match(SCANNER, /<h2 id="camera-primer-heading" ref=\{primerHeadingRef\} tabIndex=\{-1\}>/);
  assert.match(SCANNER, /if \(primerOpen && focusPrimerRef\.current\) primerHeadingRef\.current\?\.focus\(\{ preventScroll: true \}\);/);
});

test("it steps aside while the camera or its sentence is up", () => {
  assert.match(SCANNER, /const busy = cameraActive \|\| primerOpen;\s*useEffect\(\(\) => \{\s*onBusyChange\?\.\(busy\);/);
});

test("the scanner still renders on its own, with a ref", () => {
  const ref = createRef<BarcodeScannerHandle>();
  const html = renderToStaticMarkup(createElement(BarcodeScanner, { ref, onDetected: () => {} }));
  assert.match(html, /Scan with camera/);
});

// ---- Nothing covered: the geometry, from styles.css's own tokens --------------------------------

/** A custom property's value from :root. */
function token(name: string): string {
  const m = CSS.match(new RegExp(`\\n\\s*${name}:\\s*([^;]+);`));
  assert.ok(m, `token ${name}`);
  return m[1].replace(/\/\*.*?\*\//g, "").trim();
}

/** px, with env(safe-area-inset-*) at `inset` (0: no home indicator). */
function px(expr: string, inset = 0): number {
  let e = expr;
  for (let i = 0; i < 10 && /var\(/.test(e); i++) e = e.replace(/var\((--[\w-]+)\)/g, (_, n) => `(${token(n)})`);
  e = e
    .replace(/env\([^)]*\)/g, String(inset))
    .replace(/calc/g, "")
    .replace(/(\d*\.?\d+)rem/g, "($1*16)")
    .replace(/(\d*\.?\d+)px/g, "$1")
    .replace(/max\(/g, "Math.max(");
  assert.match(e, /^([\d\s.+\-*/(),]|Math\.max)+$/, `evaluable: ${e}`);
  return Function(`return ${e}`)() as number;
}

function rule(selector: string): string {
  const i = CSS.indexOf(`\n${selector} {`);
  assert.ok(i >= 0, `rule ${selector}`);
  return CSS.slice(i, CSS.indexOf("\n}", i));
}

function prop(block: string, name: string): string {
  const m = block.match(new RegExp(`\\n\\s*${name}:\\s*([^;]+);`));
  assert.ok(m, `${name} in ${block.slice(0, 40)}`);
  return m[1].trim();
}

test("the bar's height token is built from the bar's own rules", () => {
  // Every term in --tab-bar-height, where it comes from. Change one of these and this fails, so
  // the pinned button can't drift onto the bar or its raised circle unnoticed.
  assert.match(rule(".tab-bar"), /padding: var\(--space-1\) var\(--space-2\) max\(var\(--space-2\), env\(safe-area-inset-bottom\)\);/);
  assert.match(rule(".tab-bar"), /border-top: 1px solid/);
  const item = rule(".tab-bar__item");
  assert.match(item, /gap: 2px;/);
  assert.match(item, /padding-top: var\(--space-1\);/);
  assert.match(item, /font-size: var\(--text-sm\);/);
  const circle = rule(".tab-bar__item--scan .tab-bar__icon");
  assert.match(circle, /height: 3\.5rem;/);
  assert.match(circle, /margin-top: calc\(-1 \* var\(--space-5\)\);/);
  assert.match(rule("a"), /padding-block: 0\.8rem;/);
  // As measured in Chrome at 390px, no home indicator: an 86px bar, its circle reaching 101px up.
  assert.equal(Math.round(px("var(--tab-bar-height)")), 86);
  assert.equal(Math.round(px("var(--tab-bar-reach)")), 101);
});

test("the page's last control scrolls clear of the pinned button and the tab bar, with or without a home indicator", () => {
  const strip = rule(".scan-another");
  const padded = rule(".tab-shell:has(.scan-another)");
  assert.equal(prop(strip, "position"), "fixed");

  for (const inset of [0, 34]) {
    // The strip: from its bottom inset up to --scan-another-top, by construction.
    const bottom = px(prop(strip, "inset").match(/calc\(.*\)/)![0], inset);
    const top = bottom + px(prop(strip, "height"), inset);
    assert.equal(top, px("var(--scan-another-top)", inset));

    // Scrolled to the bottom, the page's last line ends `padding-bottom` above the screen's bottom
    // edge — above the strip's top, with room to spare, so nothing is ever under it.
    const padding = px(prop(padded, "padding-bottom"), inset);
    assert.ok(padding - top >= px("var(--space-4)"), `last line ${padding}px up, strip top ${top}px`);

    // The strip's bottom is tucked under the bar's top edge, so no gap shows, and the button is
    // clear of the bar's raised Scan circle.
    const bar = px("var(--tab-bar-height)", inset);
    assert.ok(bottom < bar, "tucked under the bar");
    const buttonBottom = top - px(prop(strip, "padding").split(/\s+/)[0], inset) - px("var(--tap-min)");
    const reach = px("var(--tab-bar-reach)", inset);
    assert.ok(buttonBottom >= reach + px("var(--space-2)"), `button bottom ${buttonBottom}px, circle top ${reach}px`);
  }
});

test("the button is a full tap target, as wide as the page's column", () => {
  const button = rule(".scan-another > button");
  assert.equal(prop(button, "min-height"), "var(--tap-min)");
  assert.equal(prop(button, "max-width"), "var(--measure)");
});
