import assert from "node:assert/strict";
import { test } from "node:test";

import { DISCLAIMER, VERDICT_LABEL } from "./verdictCopy";

test("every verdict has a label", () => {
  for (const verdict of ["safe", "contains_allergen", "may_contain_caution", "unable_to_confirm"] as const) {
    assert.ok(VERDICT_LABEL[verdict].length > 0, verdict);
  }
});

test("the disclaimer says it's a screening aid and to check the physical label", () => {
  assert.match(DISCLAIMER, /screening aid/);
  assert.match(DISCLAIMER, /check the physical label/);
});

test("the clean verdict reads 'No listed allergens found', and no verdict label says safe", () => {
  // Prof. Yoest's Oct 1 directive: a clean label can still carry cross-contact risk.
  assert.equal(VERDICT_LABEL.safe, "No listed allergens found");
  for (const label of Object.values(VERDICT_LABEL)) {
    assert.doesNotMatch(label, /\bsafe\b/i, label);
  }
});
