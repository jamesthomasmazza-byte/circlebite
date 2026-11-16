import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

// A standalone label photo clears the barcode field; a photo combined with a barcode scan doesn't
// (2026-10-28 audit: production showed 2990000000038 above a card read from an unrelated photo).

const SCAN = readFileSync(new URL("./Scan.tsx", import.meta.url), "utf8");
const submit = SCAN.slice(SCAN.indexOf("async function handlePhotoSubmit"), SCAN.indexOf("async function discardMismatch"));
const combine = submit.slice(submit.indexOf('if (photoCaptureMode === "combine")'), submit.indexOf("} else {"));
const standalone = submit.slice(submit.indexOf("} else {"));

test("a standalone label photo clears the barcode field once its result is in", () => {
  assert.match(standalone, /const scan = await createLabelScan\(profileId, downscaled, undefined, timing\);[\s\S]*setResult\(scan\);[\s\S]*setBarcode\(""\);/);
});

test("a photo combined with a barcode scan keeps the barcode", () => {
  assert.doesNotMatch(combine, /setBarcode/);
});

test("nothing else in the photo submit touches the field — a failed read keeps it", () => {
  assert.equal(submit.match(/setBarcode\(/g)?.length, 1);
});

// The "read the whole label" line (JT, 2026-11-16): first thing in the card body, under the headline,
// from the one helper that decides when it applies — and nothing else on the card changed for it.
const card = SCAN.slice(SCAN.indexOf('<div className="verdict-card__body">'), SCAN.indexOf("{result.identity_mismatch && ("));

test("the whole-label line opens the card body, under the headline, with the result's profile label", () => {
  assert.match(card, /wholeLabelReadLine\(result, shown, resultProfileLabel\)/);
  assert.match(card, /<p className="verdict-card__whole-label">\{line\}<\/p>/);
});

test("the whole-label line is decided in one place", () => {
  assert.equal(SCAN.match(/wholeLabelReadLine\(/g)?.length, 1);
});
