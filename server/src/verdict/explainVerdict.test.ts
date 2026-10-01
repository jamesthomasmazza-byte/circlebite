import assert from "node:assert/strict";
import { test } from "node:test";

import { explainMissingProductData, explainVerdict } from "./explainVerdict.js";
import type { MergedAllergenDetail, MergeResult } from "./mergeVerdict.js";

function allergen(overrides: Partial<MergedAllergenDetail> & Pick<MergedAllergenDetail, "allergenName" | "classification">): MergedAllergenDetail {
  return { severity: "moderate", matched: true, source: null, aiEscalated: false, ...overrides };
}

function result(matchedAllergens: MergeResult["matchedAllergens"], verdict: MergeResult["verdict"] = "safe"): MergeResult {
  return { verdict, confidence: "medium", matchedAllergens };
}

test("says nothing when the rows already say it: contains, treated-as-unsafe traces, may-contain traces", () => {
  // Each row names its allergen, its claim and its evidence (quoted matchedText or citedSpan), so a
  // sentence restating them is a second copy on a card read in three seconds (principles, Sept 30
  // 2026). Covers every positive shape the old sentences distinguished, including the trace-
  // escalated ones — that "may contain" vs "contains" distinction now lives on the row's claim line.
  const positives: [string, MergedAllergenDetail[]][] = [
    ["deterministic contains", [allergen({ allergenName: "Milk", classification: "contains", source: "ingredients" })]],
    ["AI contains with a span", [allergen({ allergenName: "Milk", classification: "contains", aiEscalated: true, citedSpan: "whey powder" })]],
    ["deterministic trace treated as unsafe", [allergen({ allergenName: "Sesame", classification: "contains", source: "trace" })]],
    ["AI trace treated as unsafe", [allergen({ allergenName: "Sesame", classification: "contains", aiEscalated: true, escalatedFromTrace: true, citedSpan: "may contain sesame" })]],
    ["may contain", [allergen({ allergenName: "Soy", classification: "caution", source: "trace" })]],
    ["positive alongside unchecked", [
      allergen({ allergenName: "Peanut", classification: "contains", source: "ingredients" }),
      allergen({ allergenName: "Almond", classification: "unchecked", matched: false }),
    ]],
  ];
  for (const [name, rows] of positives) {
    for (const evidenceSource of [undefined, "photo", "combined"] as const) {
      assert.equal(explainVerdict(result(rows, "contains_allergen"), { evidenceSource }), null, `${name} (${evidenceSource ?? "barcode"})`);
    }
  }
});

test("an unresolved allergen is still explained alongside a contains — the row says 'couldn't confirm', only this says why", () => {
  const text = explainVerdict(
    result([
      allergen({ allergenName: "Milk", severity: "severe", classification: "contains", source: "ingredients" }),
      allergen({ allergenName: "Egg", severity: "mild", classification: "unresolved", aiEscalated: true }),
      allergen({ allergenName: "Soy", severity: "mild", classification: "caution", source: "trace" }),
    ]),
  );
  assert.equal(text, "Could not confirm Egg from the ingredient text — the wording was too ambiguous to resolve.");
});

test("several unresolved allergens join with an Oxford comma", () => {
  const text = explainVerdict(
    result(
      ["Egg", "Soy", "Sesame"].map((allergenName) => allergen({ allergenName, classification: "unresolved", aiEscalated: true })),
      "unable_to_confirm",
    ),
  );
  assert.match(text ?? "", /^Could not confirm Egg, Soy, and Sesame from the ingredient text/);
});

test("unresolved allergens are named without a cited span", () => {
  const text = explainVerdict(
    result([allergen({ allergenName: "Egg", severity: "mild", classification: "unresolved", aiEscalated: true })], "unable_to_confirm"),
  );
  assert.match(text ?? "", /^Could not confirm Egg from the ingredient text/);
});

test("falls back to a clean 'nothing found' sentence when every allergen is clear", () => {
  const text = explainVerdict(result([allergen({ allergenName: "Milk", severity: "severe", classification: "clear", matched: false })]));
  assert.equal(text, "No listed allergens from this profile were found in the ingredient text.");
});

test("evidenceSource: photo — the backstop 'nothing found' sentence (a raw 'clear' input mergeVerdict.ts no longer actually produces) still leads with the limit", () => {
  const text = explainVerdict(
    result([allergen({ allergenName: "Milk", severity: "severe", classification: "clear", matched: false })], "unable_to_confirm"),
    { evidenceSource: "photo" },
  );
  assert.match(text ?? "", /^Not confirmed — we only checked the text read from your photo/);
  assert.doesNotMatch(text ?? "", /^No listed allergens/);
  assert.doesNotMatch(text ?? "", /\bsafe\b/i, "never the word safe, even negated (Prof. Yoest, Oct 1)");
});

test("evidenceSource: photo — an 'unchecked' allergen produces the real downgrade sentence, distinct from the 'clear' backstop", () => {
  const text = explainVerdict(
    result([allergen({ allergenName: "Almond", severity: "severe", classification: "unchecked", matched: false })], "unable_to_confirm"),
    { evidenceSource: "photo" },
  );
  assert.match(text ?? "", /^Not confirmed — some of your listed allergens couldn't be checked against this photo/);
});

test("evidenceSource: photo with an unresolved finding still uses the normal unresolved sentence", () => {
  const text = explainVerdict(
    result([allergen({ allergenName: "Egg", severity: "mild", classification: "unresolved", aiEscalated: true })], "unable_to_confirm"),
    { evidenceSource: "photo" },
  );
  assert.match(text ?? "", /^Could not confirm Egg/);
});

test("evidenceSource: combined — nothing found names both sources, not the single-source Path B fallback", () => {
  const text = explainVerdict(
    result([allergen({ allergenName: "Milk", severity: "severe", classification: "clear", matched: false })], "unable_to_confirm"),
    { evidenceSource: "combined" },
  );
  assert.equal(text, "Neither the product record nor the label you photographed listed any allergens from this profile.");
});

test("an 'unchecked' allergen never claims a product record was checked — unchecked only comes from a label with no record behind it", () => {
  for (const evidenceSource of ["photo", "combined"] as const) {
    const text = explainVerdict(
      result([allergen({ allergenName: "Almond", severity: "severe", classification: "unchecked", matched: false })], "unable_to_confirm"),
      { evidenceSource },
    );
    assert.match(text ?? "", /^Not confirmed — some of your listed allergens couldn't be checked against this photo/);
    assert.doesNotMatch(text ?? "", /product record/);
  }
});

test("explainMissingProductData tells an unknown barcode apart from a known product with no data (principle 2)", () => {
  const unknown = explainMissingProductData({ found: false });
  const empty = explainMissingProductData({ found: true });
  assert.notEqual(unknown, empty);
  assert.match(unknown, /don't have this barcode/);
  assert.match(empty, /have this product on file, but without its ingredients or allergen information/);
  for (const text of [unknown, empty]) {
    // Says why there's no verdict — never that anything was checked, never that it's probably fine.
    assert.match(text ?? "", /nothing to check it against/);
    assert.doesNotMatch(text ?? "", /safe|probably|no allergens/i);
  }
});
