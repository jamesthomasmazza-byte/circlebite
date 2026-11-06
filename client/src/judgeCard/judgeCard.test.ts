import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { JUDGE_BARCODE, MAYA_LINE, NOOR_LINE, renderJudgeCard } from "./judgeCard";

const repo = (path: string) => readFileSync(new URL(`../../../${path}`, import.meta.url), "utf8");
const html = renderJudgeCard();

test("the card's barcode is the seed's shared barcode", () => {
  const seed = repo("server/src/db/seed/seedData.ts");
  const circleReported = seed.slice(seed.indexOf("circleReported:"));
  assert.match(circleReported, new RegExp(`^circleReported:\\s*{\\s*barcode: "${JUDGE_BARCODE}"`));
});

test("what each profile should show is JUDGES.md's wording, word for word", () => {
  const judges = repo("JUDGES.md");
  assert.ok(judges.includes(`"${MAYA_LINE}"`), "Maya");
  assert.ok(judges.includes(`"${NOOR_LINE}"`), "Noor");
  assert.ok(judges.includes(`\`${JUDGE_BARCODE}\``));
});

test("the page names the app's own controls for the camera and for typing the digits", () => {
  // "Type it" only shows with SCAN_REDESIGN on (lib/scanRedesign.ts scanModes); the step says "if you
  // see it", so it reads right either way (JT, 2026-11-06).
  for (const label of ["Scan with camera", "Type it", "Barcode", "Check this product"]) assert.ok(html.includes(label), label);
  assert.equal(html.split(JUDGE_BARCODE).length - 1, 3, "the digits under the barcode, in the typed step, and its label");
  const scanner = repo("client/src/BarcodeScanner.tsx");
  const scan = repo("client/src/routes/Scan.tsx");
  assert.ok(scanner.includes("Scan with camera"));
  assert.ok(scan.includes("Check this product") && /<label>\s*Barcode/.test(scan));
  assert.ok(repo("client/src/lib/scanRedesign.ts").includes('{ mode: "type", label: "Type it" }'));
  assert.match(html, /Tap <strong>Type it<\/strong> if you see it, then type/);
});

test("self-contained: no external request, nothing to load", () => {
  // The SVG namespace is a name, not a request.
  assert.doesNotMatch(html.replaceAll('xmlns="http://www.w3.org/2000/svg"', ""), /https?:\/\//);
  assert.doesNotMatch(html, /<(script|link|img)\b/);
  assert.match(html, /<svg [^>]*aria-label="Barcode 2990000000083"/);
});

test("nothing dark beside the barcode: its box has rules above and below only", () => {
  const rule = html.match(/\.code \{[^}]*\}/)?.[0] ?? "";
  assert.match(rule, /border-top:/);
  assert.match(rule, /border-bottom:/);
  assert.doesNotMatch(rule, /border(-left|-right)?:\s*\d/, "no side border, and no all-round border");
});
