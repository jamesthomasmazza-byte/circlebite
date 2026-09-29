import assert from "node:assert/strict";
import { test } from "node:test";

import { reportOutcomeMessage } from "./correctionCopy";

test("reportOutcomeMessage: a first add_caution report never claims other reports agreed", () => {
  // The 2026-09-29 live test: one sesame report, and the confirmation said "enough other reports
  // agreed" — there were none. An addition corroborates on its first report (threshold 1).
  const message = reportOutcomeMessage({ correctionType: "flag_missing", corroborated: true, hasBarcode: true });
  assert.doesNotMatch(message, /other reports/);
  assert.match(message, /now shows for other families/);
});

test("reportOutcomeMessage: a corroborated removal says others agreed, and that it's still only the reporter's view", () => {
  for (const correctionType of ["flag_wrong", "wrong_product"] as const) {
    const message = reportOutcomeMessage({ correctionType, corroborated: true, hasBarcode: true });
    assert.match(message, /enough other reports agreed/);
    assert.match(message, /only changes your own view/);
    assert.match(message, /other families keep seeing it/);
  }
});

test("reportOutcomeMessage: pending and barcode-less reports keep their existing wording", () => {
  assert.equal(
    reportOutcomeMessage({ correctionType: "flag_wrong", corroborated: false, hasBarcode: true }),
    "Reported — thanks. This is now in the review queue.",
  );
  // A barcode-less report never corroborates, whichever direction it is.
  for (const correctionType of ["flag_missing", "flag_wrong"] as const) {
    assert.match(reportOutcomeMessage({ correctionType, corroborated: false, hasBarcode: false }), /without a barcode/);
  }
});
