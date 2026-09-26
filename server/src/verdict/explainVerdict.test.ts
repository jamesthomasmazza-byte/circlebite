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

test("a trace-escalated 'contains' (source: trace, deterministic — treatTracesAsUnsafe already resolved by match.ts) gets its own headline, not the 'Contains' sentence", () => {
  const text = explainVerdict(
    result([allergen({ allergenName: "Sesame", severity: "severe", classification: "contains", source: "trace" })], "contains_allergen"),
  );
  assert.equal(text, "Treat as containing Sesame.");
});

test("a trace-escalated 'contains' via an AI-reported trace finding (escalatedFromTrace: true) also gets the 'Treat as containing' headline", () => {
  const text = explainVerdict(
    result(
      [allergen({ allergenName: "Sesame", severity: "severe", classification: "contains", aiEscalated: true, escalatedFromTrace: true, citedSpan: "may contain sesame" })],
      "contains_allergen",
    ),
  );
  assert.equal(text, "Treat as containing Sesame.");
});

test("a 'contains' from an AI direct finding that happens to share a trace-tagged allergen (source: trace, but escalatedFromTrace not set) still reads as a genuine 'Contains' claim", () => {
  // The exact case that would be a false positive if isTraceEscalatedToContains trusted `source`
  // alone whenever aiEscalated is true: a deterministic trace tag existed, but the AI found
  // separate, direct evidence ("yes", not "trace") — a real "contains" claim, not a "may contain"
  // one.
  const text = explainVerdict(
    result(
      [allergen({ allergenName: "Sesame", severity: "severe", classification: "contains", source: "trace", aiEscalated: true, citedSpan: "sesame oil" })],
      "contains_allergen",
    ),
  );
  assert.equal(text, 'Contains Sesame ("sesame oil").');
});

test("a genuine 'Contains' finding takes priority over a trace-escalated one when both are present", () => {
  const text = explainVerdict(
    result(
      [
        allergen({ allergenName: "Milk", severity: "severe", classification: "contains", source: "ingredients" }),
        allergen({ allergenName: "Sesame", severity: "severe", classification: "contains", source: "trace" }),
      ],
      "contains_allergen",
    ),
  );
  assert.equal(text, "Contains Milk.");
});

test("multiple trace-escalated allergens join into one 'Treat as containing' sentence", () => {
  const text = explainVerdict(
    result(
      [
        allergen({ allergenName: "Sesame", severity: "severe", classification: "contains", source: "trace" }),
        allergen({ allergenName: "Milk", severity: "severe", classification: "contains", source: "trace" }),
      ],
      "contains_allergen",
    ),
  );
  assert.equal(text, "Treat as containing Sesame and Milk.");
});

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

test("photoSourced: the backstop 'nothing found' sentence (a raw 'clear' input mergeVerdict.ts no longer actually produces) still leads with the limit", () => {
  const text = explainVerdict(
    result([allergen({ allergenName: "Milk", severity: "severe", classification: "clear", matched: false })], "unable_to_confirm"),
    { photoSourced: true },
  );
  assert.match(text, /^This hasn't been confirmed safe/);
  assert.doesNotMatch(text, /^No listed allergens/);
});

test("photoSourced: an 'unchecked' allergen produces the real downgrade sentence, distinct from the 'clear' backstop", () => {
  const text = explainVerdict(
    result([allergen({ allergenName: "Almond", severity: "severe", classification: "unchecked", matched: false })], "unable_to_confirm"),
    { photoSourced: true },
  );
  assert.match(text, /^This hasn't been confirmed safe — some of your listed allergens couldn't be checked against this photo/);
});

test("photoSourced: 'unchecked' allergens don't get a headline sentence at all when a contains/unresolved/caution finding also exists — that branch wins first", () => {
  const text = explainVerdict(
    result(
      [
        allergen({ allergenName: "Peanut", severity: "severe", classification: "contains", source: "ingredients" }),
        allergen({ allergenName: "Almond", severity: "severe", classification: "unchecked", matched: false }),
      ],
      "contains_allergen",
    ),
    { photoSourced: true },
  );
  assert.equal(text, "Contains Peanut.");
});

test("photoSourced with a real contains finding still uses the normal contains sentence, not the downgrade copy", () => {
  const text = explainVerdict(
    result([allergen({ allergenName: "Milk", severity: "severe", classification: "contains", source: "ingredients" })]),
    { photoSourced: true },
  );
  assert.equal(text, "Contains Milk.");
});

test("photoSourced with an unresolved finding still uses the normal unresolved sentence", () => {
  const text = explainVerdict(
    result([allergen({ allergenName: "Egg", severity: "mild", classification: "unresolved", aiEscalated: true })], "unable_to_confirm"),
    { photoSourced: true },
  );
  assert.match(text, /^Could not confirm Egg/);
});
