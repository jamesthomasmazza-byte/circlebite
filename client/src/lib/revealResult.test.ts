import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { revealBehavior, revealResult } from "./revealResult";

// A new verdict is brought into view and its heading focused, so a screen reader reads it
// (2026-10-28 audit: focus fell to <body> after a scan, and the card sat under the tab bar).

type Call = { what: string; arg: unknown };

function fakeElement(calls: Call[], name: string, container: unknown = null) {
  return {
    scrollIntoView: (arg: unknown) => calls.push({ what: `${name}.scroll`, arg }),
    focus: (arg: unknown) => calls.push({ what: `${name}.focus`, arg }),
    closest: () => container,
  } as unknown as HTMLElement;
}

test("revealResult scrolls the card's container to its top, then focuses the heading without scrolling", () => {
  const calls: Call[] = [];
  const card = fakeElement(calls, "card");
  const heading = fakeElement(calls, "heading", card);

  revealResult(heading, false);

  assert.deepEqual(calls, [
    { what: "card.scroll", arg: { block: "start", behavior: "smooth" } },
    { what: "heading.focus", arg: { preventScroll: true } },
  ]);
});

test("under prefers-reduced-motion the scroll is instant", () => {
  const calls: Call[] = [];
  const heading = fakeElement(calls, "heading");

  revealResult(heading, true);

  assert.deepEqual(calls[0], { what: "heading.scroll", arg: { block: "start", behavior: "auto" } });
  assert.equal(revealBehavior(true), "auto");
  assert.equal(revealBehavior(false), "smooth");
});

const SCAN = readFileSync(new URL("../routes/Scan.tsx", import.meta.url), "utf8");

test("Scan asks for a reveal where a new result arrives: a scan, a standalone photo, a combined photo", () => {
  assert.match(SCAN, /const scan = await createScan\(targetProfileId, rawBarcode\.trim\(\)\);\s*setResult\(scan\);\s*setResultProfileId\(targetProfileId\);\s*requestReveal\(\);/);
  assert.match(SCAN, /const scan = await createLabelScan\(profileId, downscaled\);[\s\S]{0,200}setResult\(scan\);\s*setResultProfileId\(profileId\);\s*requestReveal\(\);/);
  assert.match(SCAN, /applyCombineOutcome\(outcome\);\s*setPhotoCaptureOpen\(false\);\s*setPhotoFile\(null\);\s*requestReveal\(\);/);
  assert.equal(SCAN.match(/requestReveal\(\);/g)?.length, 3, "exactly those three places");
});

test("a report or a discarded photo changes the card without moving the page", () => {
  const report = SCAN.slice(SCAN.indexOf("async function handleReportSubmit"), SCAN.indexOf("// The engine's own verdict unless"));
  assert.doesNotMatch(report, /requestReveal/);
  const discard = SCAN.slice(SCAN.indexOf("async function discardMismatch"), SCAN.indexOf("function openDisagreementReport"));
  assert.doesNotMatch(discard, /requestReveal/);
  const apply = SCAN.slice(SCAN.indexOf("function applyCombineOutcome"), SCAN.indexOf("async function handlePhotoSubmit"));
  assert.doesNotMatch(apply, /requestReveal/);
});

test("both result headings can take focus, and only one renders at a time", () => {
  assert.equal(SCAN.match(/<h2 ref=\{resultHeadingRef\} tabIndex=\{-1\}>/g)?.length, 2);
  assert.equal(SCAN.match(/<section data-reveal-target>/g)?.length, 2);
});
