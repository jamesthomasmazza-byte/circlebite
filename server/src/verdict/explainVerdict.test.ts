import assert from "node:assert/strict";
import { test } from "node:test";

import { explainVerdict } from "./explainVerdict.js";
import type { MergedAllergenDetail, MergeResult } from "./mergeVerdict.js";

function allergen(overrides: Partial<MergedAllergenDetail> & Pick<MergedAllergenDetail, "allergenName" | "classification">): MergedAllergenDetail {
  return { severity: "moderate", matched: true, source: null, aiEscalated: false, ...overrides };
}

function result(matchedAllergens: MergeResult["matchedAllergens"], verdict: MergeResult["verdict"] = "safe"): MergeResult {
  return { verdict, confidence: "medium", matchedAllergens };
}

test("names the cited span for a single contains", () => {
  const text = explainVerdict(
    result([allergen({ allergenName: "Milk", severity: "severe", classification: "contains", aiEscalated: true, citedSpan: "whey powder" })]),
  );
  assert.equal(text, 'Contains Milk ("whey powder").');
});

test("joins two contains allergens with 'and'", () => {
  const text = explainVerdict(
    result([
      allergen({ allergenName: "Milk", severity: "severe", classification: "contains", source: "ingredients" }),
      allergen({ allergenName: "Soy", severity: "mild", classification: "contains", source: "ingredients" }),
    ]),
  );
  assert.equal(text, "Contains Milk and Soy.");
});

test("joins three or more with an Oxford comma", () => {
  const text = explainVerdict(
    result([
      allergen({ allergenName: "Milk", severity: "severe", classification: "contains", source: "ingredients" }),
      allergen({ allergenName: "Soy", severity: "mild", classification: "contains", source: "ingredients" }),
      allergen({ allergenName: "Peanut", severity: "severe", classification: "contains", source: "ingredients" }),
    ]),
  );
  assert.equal(text, "Contains Milk, Soy, and Peanut.");
});

test("contains takes priority over unresolved and caution when several allergens differ", () => {
  const text = explainVerdict(
    result([
      allergen({ allergenName: "Milk", severity: "severe", classification: "contains", source: "ingredients" }),
      allergen({ allergenName: "Egg", severity: "mild", classification: "unresolved", aiEscalated: true }),
      allergen({ allergenName: "Soy", severity: "mild", classification: "caution", source: "trace" }),
    ]),
  );
  assert.equal(text, "Contains Milk.");
});

test("unresolved allergens are named without a cited span", () => {
  const text = explainVerdict(
    result([allergen({ allergenName: "Egg", severity: "mild", classification: "unresolved", aiEscalated: true })], "unable_to_confirm"),
  );
  assert.match(text, /^Could not confirm Egg from the ingredient text/);
});

test("caution names the cited span when present", () => {
  const text = explainVerdict(
    result(
      [allergen({ allergenName: "Soy", severity: "mild", classification: "caution", aiEscalated: true, citedSpan: "may contain soy" })],
      "may_contain_caution",
    ),
  );
  assert.equal(text, 'May contain traces of Soy ("may contain soy").');
});

test("falls back to a clean 'nothing found' sentence when every allergen is clear", () => {
  const text = explainVerdict(result([allergen({ allergenName: "Milk", severity: "severe", classification: "clear", matched: false })]));
  assert.equal(text, "No listed allergens from this profile were found in the ingredient text.");
});
