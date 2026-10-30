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
