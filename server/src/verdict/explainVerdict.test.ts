import assert from "node:assert/strict";
import { test } from "node:test";

import { explainVerdict } from "./explainVerdict.js";
import type { MergeResult } from "./mergeVerdict.js";

function result(matchedAllergens: MergeResult["matchedAllergens"], verdict: MergeResult["verdict"] = "safe"): MergeResult {
  return { verdict, confidence: "medium", matchedAllergens };
}

test("names the cited span for a single contains", () => {
  const text = explainVerdict(
    result([{ allergenName: "Milk", severity: "severe", classification: "contains", source: "ai", citedSpan: "whey powder" }]),
  );
  assert.equal(text, 'Contains Milk ("whey powder").');
});

test("joins two contains allergens with 'and'", () => {
  const text = explainVerdict(
    result([
      { allergenName: "Milk", severity: "severe", classification: "contains", source: "deterministic" },
      { allergenName: "Soy", severity: "mild", classification: "contains", source: "deterministic" },
    ]),
  );
  assert.equal(text, "Contains Milk and Soy.");
});

test("joins three or more with an Oxford comma", () => {
  const text = explainVerdict(
    result([
      { allergenName: "Milk", severity: "severe", classification: "contains", source: "deterministic" },
      { allergenName: "Soy", severity: "mild", classification: "contains", source: "deterministic" },
      { allergenName: "Peanut", severity: "severe", classification: "contains", source: "deterministic" },
    ]),
  );
  assert.equal(text, "Contains Milk, Soy, and Peanut.");
});

test("contains takes priority over unresolved and caution when several allergens differ", () => {
  const text = explainVerdict(
    result([
      { allergenName: "Milk", severity: "severe", classification: "contains", source: "deterministic" },
      { allergenName: "Egg", severity: "mild", classification: "unresolved", source: "ai" },
      { allergenName: "Soy", severity: "mild", classification: "caution", source: "deterministic" },
    ]),
  );
  assert.equal(text, "Contains Milk.");
});

test("unresolved allergens are named without a cited span", () => {
  const text = explainVerdict(result([{ allergenName: "Egg", severity: "mild", classification: "unresolved", source: "ai" }], "unable_to_confirm"));
  assert.match(text, /^Could not confirm Egg from the ingredient text/);
});

test("caution names the cited span when present", () => {
  const text = explainVerdict(
    result([{ allergenName: "Soy", severity: "mild", classification: "caution", source: "ai", citedSpan: "may contain soy" }], "may_contain_caution"),
  );
  assert.equal(text, 'May contain traces of Soy ("may contain soy").');
});

test("falls back to a clean 'nothing found' sentence when every allergen is clear", () => {
  const text = explainVerdict(
    result([{ allergenName: "Milk", severity: "severe", classification: "clear", source: "deterministic" }]),
  );
  assert.equal(text, "No listed allergens from this profile were found in the ingredient text.");
});
