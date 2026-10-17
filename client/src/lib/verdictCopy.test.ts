import assert from "node:assert/strict";
import { test } from "node:test";

import { couldntReadHeading, DISCLAIMER, EMERGENCY, VERDICT_LABEL } from "./verdictCopy";

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

test("the emergency referral names 911 and says when to call", () => {
  // Prof. Yoest's Oct 1 directive, CONTEST_RULES.md §3a.
  assert.equal(EMERGENCY, "If anyone has an allergic reaction, call 911.");
});

test("the couldn't-read heading blames the label only when the label was actually read", () => {
  assert.equal(couldntReadHeading(false), "Couldn't read that label");
  assert.equal(couldntReadHeading(undefined), "Couldn't read that label");
  assert.equal(couldntReadHeading(true), "Couldn't check that photo");
  assert.doesNotMatch(couldntReadHeading(true), /label|_|error|key/i);
});
