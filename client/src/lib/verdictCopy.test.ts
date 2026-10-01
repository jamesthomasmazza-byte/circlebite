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
