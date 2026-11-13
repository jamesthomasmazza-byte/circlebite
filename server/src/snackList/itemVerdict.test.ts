import assert from "node:assert/strict";
import { test } from "node:test";

import type { ProductForMatching, ProfileAllergen } from "../matcher/match.js";
import { computeItemVerdict, type OriginatingScan } from "./itemVerdict.js";

const peanut: ProfileAllergen = { name: "Peanut", severity: "severe", treatTracesAsUnsafe: true, key: "peanut" };
const milk: ProfileAllergen = { name: "Milk", severity: "moderate", treatTracesAsUnsafe: false, key: "milk" };
const egg: ProfileAllergen = { name: "Egg", severity: "mild", treatTracesAsUnsafe: false, key: "egg" };

// Tags arrive normalized (lib/openFoodFacts.ts strips the "en:" prefix), so fixtures use the bare word.
const tagged: ProductForMatching = { found: true, allergensTags: ["milk"], tracesTags: [], ingredientsText: "oats, sugar, whey" };
const TEXT = "rice flour, sugar, sunflower oil, natural flavor, salt";
const textOnly: ProductForMatching = { found: true, allergensTags: [], tracesTags: [], ingredientsText: TEXT };

function scanOf(details: OriginatingScan["matchedAllergens"], ingredientsText: string | null = TEXT): OriginatingScan {
  return { matchedAllergens: details, ingredientsText };
}

function byName(result: ReturnType<typeof computeItemVerdict>, name: string) {
  const row = result.matchedAllergens.find((d) => d.allergenName === name);
  assert.ok(row, `expected a row for ${name}`);
  return row;
}

test("no product data is Unable to confirm with no rows, as a scan", () => {
  const result = computeItemVerdict([peanut], { found: false, allergensTags: [], tracesTags: [], ingredientsText: null }, null);
  assert.deepEqual(result, { verdict: "unable_to_confirm", matchedAllergens: [] });
});

test("a structured-tag product is the matcher's answer, with no floor needed", () => {
  const result = computeItemVerdict([peanut, milk], tagged, null);
  assert.equal(result.verdict, "contains_allergen");
  assert.equal(byName(result, "Milk").classification, "contains");
  assert.equal(byName(result, "Milk").aiEscalated, false);
  assert.equal(byName(result, "Peanut").classification, "clear");
});

test("an allergen added to the profile after the scan flags the item on the current row", () => {
  // The scan was taken with Peanut only, and read clean. Milk was added later; the row lists milk.
  const scan = scanOf([{ allergenName: "Peanut", classification: "clear", aiEscalated: false }], tagged.ingredientsText);
  const result = computeItemVerdict([peanut, milk], tagged, scan);
  assert.equal(result.verdict, "contains_allergen");
  assert.equal(byName(result, "Milk").classification, "contains");
});

test("text-only product: the model's escalation is carried as a floor, with its cited span", () => {
  // The matcher finds nothing for Egg in TEXT; on the scan the model did, citing "natural flavor".
  const scan = scanOf([
    { allergenName: "Egg", classification: "contains", aiEscalated: true, citedSpan: "natural flavor", reason: "may be egg-derived" },
    { allergenName: "Peanut", classification: "clear", aiEscalated: false },
  ]);
  const result = computeItemVerdict([peanut, egg], textOnly, scan);
  assert.equal(result.verdict, "contains_allergen");
  const row = byName(result, "Egg");
  assert.equal(row.classification, "contains");
  assert.equal(row.aiEscalated, true);
  assert.equal(row.citedSpan, "natural flavor");
  assert.equal(byName(result, "Peanut").classification, "clear");
});

test("text-only product: a stored matcher hit is not carried once the current row no longer has it", () => {
  // The scan's row said "peanut oil"; the product record was since corrected and the word is gone.
  const scan = scanOf(
    [{ allergenName: "Peanut", classification: "contains", aiEscalated: false, source: "ingredients", matchedText: "peanut" }],
    "rice flour, sugar, peanut oil, salt",
  );
  const result = computeItemVerdict([peanut], textOnly, scan);
  // The text changed, so the model's clearance of nothing else applies; Peanut itself is recomputed
  // from the current row (no match) and, with the text changed, is unchecked rather than clear.
  assert.equal(byName(result, "Peanut").classification, "unchecked");
  assert.equal(result.verdict, "unable_to_confirm");
});

test("text-only product: an allergen the model never saw is unchecked, and the item is Unable to confirm", () => {
  const scan = scanOf([{ allergenName: "Peanut", classification: "clear", aiEscalated: false }]);
  const result = computeItemVerdict([peanut, egg], textOnly, scan);
  assert.equal(byName(result, "Peanut").classification, "clear");
  assert.equal(byName(result, "Egg").classification, "unchecked");
  assert.equal(result.verdict, "unable_to_confirm");
});

test("text-only product: the model's clear stands while the row's text is the text it read", () => {
  const scan = scanOf([
    { allergenName: "Peanut", classification: "clear", aiEscalated: false },
    { allergenName: "Egg", classification: "clear", aiEscalated: false },
  ]);
  const result = computeItemVerdict([peanut, egg], textOnly, scan);
  assert.equal(result.verdict, "safe");
});

test("text-only product with no originating scan is never clear on the matcher alone", () => {
  const result = computeItemVerdict([peanut], textOnly, null);
  assert.equal(byName(result, "Peanut").classification, "unchecked");
  assert.equal(result.verdict, "unable_to_confirm");
});

test("a term the model could not resolve on the scan stays unresolved here", () => {
  const scan = scanOf([{ allergenName: "Egg", classification: "unresolved", aiEscalated: false }]);
  const result = computeItemVerdict([egg], textOnly, scan);
  assert.equal(byName(result, "Egg").classification, "unresolved");
  assert.equal(result.verdict, "unable_to_confirm");
});

test("a matcher trace with traces tolerated is a caution, and outranks an unchecked row", () => {
  const traced: ProductForMatching = { found: true, allergensTags: [], tracesTags: ["milk"], ingredientsText: TEXT };
  const result = computeItemVerdict([milk, egg], traced, null);
  assert.equal(byName(result, "Milk").classification, "caution");
  // Not text-only (a traces tag is structured data), so Egg is the matcher's clear.
  assert.equal(byName(result, "Egg").classification, "clear");
  assert.equal(result.verdict, "may_contain_caution");
});

test("stored details are matched on the folded name, so Peanuts on the scan floors Peanut on the profile", () => {
  const scan = scanOf([{ allergenName: "Peanuts", classification: "contains", aiEscalated: true, citedSpan: "natural flavor" }]);
  const result = computeItemVerdict([peanut], textOnly, scan);
  assert.equal(byName(result, "Peanut").classification, "contains");
  assert.equal(byName(result, "Peanut").aiEscalated, true);
});
