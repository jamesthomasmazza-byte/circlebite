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
  for (const block of ["<p className=\"scan-recent-link\"", "<div className=\"scan-modes\""]) {
    const at = SCAN.indexOf(block);
    assert.ok(at > 0, block);
    assert.match(SCAN.slice(SCAN.lastIndexOf("{redesign &&", at), at), /^\{redesign &&/, block);
  }
});

test("one scanner either way: the stage is the same BarcodeScanner, kept mounted for Scan another", () => {
  assert.equal(SCAN.match(/<BarcodeScanner\b/g)?.length, 1);
  assert.match(SCAN, /<BarcodeScanner\s+ref=\{scannerRef\}\s+onBusyChange=\{setScannerBusy\}\s+stage=\{redesign\}/);
});

test("Recent is one link to the chosen profile's scan history, in every mode, with no verdict of its own", () => {
  // JT, 2026-11-06: the strip's cards overlapped on an iPhone; one link row replaces them.
  const link = SCAN.slice(SCAN.indexOf('<p className="scan-recent-link">'), SCAN.indexOf("</p>", SCAN.indexOf('<p className="scan-recent-link">')));
  assert.match(SCAN, /\{redesign && selectedProfile && \(\s*<p className="scan-recent-link">/, "not behind any mode");
  assert.match(link, /<Link to=\{`\/profiles\/\$\{selectedProfile\.id\}\/history`\}>\s*\{RECENT_SCANS\}/);
  assert.match(link, /<span aria-hidden="true">›<\/span>/);
  assert.doesNotMatch(SCAN, /VERDICT_LABEL\[r\.|DISCLAIMER_SHORT|getScanHistory|scan-recent__/, "no verdicts, so no disclaimer, on the camera screen");
  // History keeps its own disclaimer and 911 line.
  const history = readFileSync(new URL("./ScanHistory.tsx", import.meta.url), "utf8");
  assert.match(history, /<p>\{DISCLAIMER\}<\/p>\s*<p>\s*<strong>\{EMERGENCY\}<\/strong>/);
});

test("the segmented control: leaving Barcode stops the camera; Label photo opens today's photo form", () => {
  const choose = SCAN.slice(SCAN.indexOf("function chooseMode("), SCAN.indexOf("// Shared between the barcode flow"));
  assert.match(choose, /if \(next !== "barcode"\) scannerRef\.current\?\.stop\(\);/);
  assert.match(choose, /if \(next === "photo"\) openStandalonePhotoCapture\(\);/);
  assert.match(SCAN, /scanModes\(labelScanEnabled\)\.map/);
});

// ---- The result sheet: today's card, in a sheet ----

const LABEL_CAMERA = readFileSync(new URL("../LabelCamera.tsx", import.meta.url), "utf8");
const card = SCAN.slice(SCAN.indexOf('<div className="verdict-card" data-verdict={shown.result}>'), SCAN.indexOf("{/* Directly under the card it disputes"));

test("the banner is today's: the verdict card's own label and colour, from what the card shows", () => {
  assert.match(card, /<h2 ref=\{resultHeadingRef\} tabIndex=\{-1\}>\s*\{VERDICT_LABEL\[shown\.result\]\}\s*<\/h2>/);
  assert.match(SCAN, /const shown = result && \(result\.effective \?\? \{ result: result\.result, matched_allergens: result\.matched_allergens \}\);/);
  // No second verdict anywhere in the redesign's blocks, and never the word.
  for (const block of [SCAN.slice(SCAN.indexOf('<div className="scan-sheet__top">'), SCAN.indexOf('<div className="verdict-card"')), LABEL_CAMERA]) {
    assert.doesNotMatch(block, /VERDICT_LABEL|data-verdict/);
    assert.doesNotMatch(block.replace(/\/\/.*$|\{\/\*[\s\S]*?\*\/\}|\/\*[\s\S]*?\*\//gm, ""), /\bsafe\b/i);
  }
});

test("the disclaimer and the 911 line are on every result, in both layouts: they sit in the shared card", () => {
  assert.match(card, /<div role="note" className="verdict-card__disclaimer">\s*<p>\{DISCLAIMER\}<\/p>\s*<p>\s*<strong>\{EMERGENCY\}<\/strong>/);
  // One disclaimer, in the card both layouts render for every result: not behind either branch.
  assert.equal(SCAN.match(/className="verdict-card__disclaimer"/g)?.length, 1);
  assert.match(card, /\)\}\s*<div role="note" className="verdict-card__disclaimer">/, "after the may-contain block closes");
});

test("a held removal stays a note on its row: the redesign adds no path to the clean banner", () => {
  // The row keeps disputedNote; the headline is shown.result, which a pending removal never lowers
  // (server applyCorrections.ts, Oct 23; Prof. Yoest's green card, Oct 24).
  assert.match(card, /\{disputedNote\(m\) && \(/);
  // The card names a verdict in two places only, as today: the headline, and the engine's own verdict
  // in the note that says what changed it.
  assert.deepEqual(card.match(/VERDICT_LABEL\[[^\]]+\]/g), ["VERDICT_LABEL[shown.result]", "VERDICT_LABEL[result.result]"]);
});

test("a pending circle report on its row is today's sentence: by name to managers, by role to a follower", () => {
  assert.match(card, /circleReportsOnRow\(result\.pending_circle_reports, m\.allergenName\)\.map\(\(r\) => \(\s*<span[^>]*>\s*\{circleReportLine\(r, resultProfileLabel\)\}/);
  // And the list under the rows keeps every report, as today: "Changed because of:" keeps its items.
  assert.match(card, /\{result\.pending_circle_reports\.map\(\(r\) => \(\s*<li key=\{`circle-\$\{r\.allergenName\}`\} className="circle-report">/);
});

test("the may-contain line comes from the record, and only in the redesign", () => {
  assert.match(card, /\{redesign && mayContainLine\(result\.record_may_contain\) && \(/);
});

// ---- The label photo screen ----

test("the label camera never opens by itself: a tap, with the first-use sentence first", () => {
  assert.match(LABEL_CAMERA, /function request\(\) \{\s*if \(cameraPrimerSeen\(\)\) void start\(\);\s*else setPrimerOpen\(true\);\s*\}/);
  for (const effect of LABEL_CAMERA.split("useEffect(").slice(1)) {
    assert.doesNotMatch(effect.slice(0, effect.indexOf(");")), /start\(|request\(/);
  }
});

test("a captured photo goes the same way as a chosen one: handlePhotoSubmit, so the same downscale and upload", () => {
  assert.match(SCAN, /if \(!capturedPending \|\| !photoFile\) return;\s*setCapturedPending\(false\);\s*void handlePhotoSubmit\(/);
  assert.match(SCAN, /const downscaled = await downscaleLabelPhoto\(photoFile\);/);
  assert.match(SCAN, /<LabelCamera\s+busy=\{photoReading\}/);
  assert.match(LABEL_CAMERA, /\{active && torchAvailable && \(/, "flash only with a torch");
});

test("a \"not found\" row, shown only in the redesign, says it once", () => {
  assert.match(card, /\{!\(redesign && m\.classification === "clear"\) && \(\s*<>\s*<span className="visually-hidden"> — <\/span>\s*<span className="allergen-row__source" data-source=\{rowSource\(m\)\}>/);
});

test("the landing fits one screen: the camera gives way, so Recent and the mode control show under a notice", () => {
  // JT, 2026-11-06: at 390x844 with Condition 2's notice, Recent's bottom sat under the control.
  const css = readFileSync(new URL("../styles.css", import.meta.url), "utf8");
  const stage = css.slice(css.indexOf(".tab-shell--camera:has(.scan-target--stage:not([hidden])) {"));
  assert.match(stage, /^[^}]*min-height: calc\(100dvh - /, "at least the screen while the camera stage shows");
  assert.doesNotMatch(stage.slice(0, stage.indexOf("}")), /(^|\s)height:/, "never pinned to exactly one screen: larger text scrolls instead of overlapping");
  assert.match(css, /\.tab-shell--camera > main \{\s*display: flex;\s*flex: 1 0 auto;/, "main never shrinks below its content");
  assert.match(css, /\.tab-shell--camera > \*,\s*\.tab-shell--camera > main > \* \{\s*flex-shrink: 0;/, "nothing else gives way");
  assert.match(css, /\.scanner\.scanner--stage \{[^}]*flex: 1 1 0;\s*min-height: 10rem;/, "the camera does, down to 10rem");
});

test("the page follows the app's theme; only the live camera viewport is dark", () => {
  // JT, 2026-11-06, from an iPhone: the whole page was dark in light mode.
  const css = readFileSync(new URL("../styles.css", import.meta.url), "utf8");
  const redesign = css.slice(css.indexOf("/* ---------- The redesigned Scan tab (Scan.tsx, ScanPill.tsx"));
  assert.doesNotMatch(redesign, /viewfinder/, "no camera-stage colours on the page");
  const rule = (sel: string) => redesign.slice(redesign.indexOf(`${sel} {`), redesign.indexOf("}", redesign.indexOf(`${sel} {`)));
  assert.match(rule(".tab-shell--camera"), /^[^}]*$/);
  assert.doesNotMatch(rule(".tab-shell--camera"), /background|color:/);
  assert.match(rule(".scan-pill"), /background: var\(--color-surface\);\s*color: var\(--color-text\);/);
  assert.match(rule(".scan-chip"), /color: var\(--color-text\);/);
  assert.match(rule(".scan-modes button[aria-pressed=\"true\"]"), /background: var\(--color-accent\);\s*color: var\(--color-on-accent\);/);
  assert.match(rule(".scanner.scanner--stage"), /background: #000;/, "the camera viewport stays dark");
});

test("the mode control is in the page's flow: it never floats over content, in any mode", () => {
  // JT, 2026-11-06: pinned over the page, it hid the label checklist's second and third items.
  const css = readFileSync(new URL("../styles.css", import.meta.url), "utf8");
  const rule = css.slice(css.indexOf(".scan-modes {"), css.indexOf("}", css.indexOf(".scan-modes {")));
  assert.doesNotMatch(rule, /position: (fixed|absolute|sticky)/);
  assert.doesNotMatch(css, /\.tab-shell:has\(\.scan-modes\)/, "no padding reserved for a floating control");
  // Last in the page's main column, after whatever the mode shows.
  const modes = SCAN.indexOf('<div className="scan-modes"');
  assert.ok(modes > SCAN.indexOf("<form ref={photoFormRef}") && modes > SCAN.indexOf('<form onSubmit={handleSubmit}'));
  assert.match(css, /\.scan-modes button \{\s*flex: 1 1 0;\s*min-width: 0;[^}]*overflow-wrap: normal;\s*word-break: normal;/, "words wrap whole");
});

test("nothing in the redesigned Scan is wider than the screen", () => {
  // JT, 2026-11-06: the page scrolled sideways in label photo mode, a white strip on the right. The
  // browser check at 390px (every mode, 100/125/150% text, both themes) finds no element past the
  // right edge; these are the rules that hold it.
  const css = readFileSync(new URL("../styles.css", import.meta.url), "utf8");
  assert.match(css, /\.tab-shell--camera > \*,\s*\.tab-shell--camera > main > \* \{\s*box-sizing: border-box;\s*min-width: 0;\s*max-width: 100%;/);
  assert.match(css, /\.tab-shell--camera main input\[type="file"\] \{\s*max-width: 100%;/);
});

test("the redesign's forms are the column's width, not their heading's", () => {
  const css = readFileSync(new URL("../styles.css", import.meta.url), "utf8");
  assert.match(css, /\.tab-shell--camera main form \{[^}]*box-sizing: border-box;\s*width: 100%;\s*max-width: min\(100%, var\(--measure\)\);/);
});
