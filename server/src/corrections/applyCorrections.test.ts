import assert from "node:assert/strict";
import { test } from "node:test";

import { applyUserCorrections, type ScanForCorrection, type UserCorrection } from "./applyCorrections.js";

function scan(result: string, matchedAllergens: ScanForCorrection["matchedAllergens"]): ScanForCorrection {
  return { result, matchedAllergens };
}

function correction(overrides: Partial<UserCorrection> & Pick<UserCorrection, "correctionType" | "direction">): UserCorrection {
  return { id: "c1", allergen: null, note: null, status: "pending", createdAt: "2026-09-10T00:00:00Z", ...overrides };
}

test("returns null when the user has no corrections on this scan — no override", () => {
  const s = scan("contains_allergen", [{ allergenName: "Milk", severity: "severe", classification: "contains" }]);
  assert.equal(applyUserCorrections(s, []), null);
});

test("flag_wrong clears the targeted allergen and recomputes the result", () => {
  const s = scan("contains_allergen", [{ allergenName: "Milk", severity: "severe", classification: "contains" }]);
  const effective = applyUserCorrections(s, [
    correction({ correctionType: "flag_wrong", direction: "remove_caution", allergen: "Milk" }),
  ]);
  assert.equal(effective?.result, "safe");
  assert.equal(effective?.matchedAllergens[0].classification, "clear");
});

test("flag_missing sets the allergen straight to 'contains', never 'caution' — direct ingredient, not trace", () => {
  const s = scan("safe", [{ allergenName: "Egg", severity: "moderate", classification: "clear" }]);
  const effective = applyUserCorrections(s, [
    correction({ correctionType: "flag_missing", direction: "add_caution", allergen: "Egg" }),
  ]);
  assert.equal(effective?.result, "contains_allergen");
  assert.equal(effective?.matchedAllergens[0].classification, "contains");
});

test("flag_missing for an allergen not already on the scan creates an entry, defaulting to severe visibility", () => {
  const s = scan("safe", []);
  const effective = applyUserCorrections(s, [
    correction({ correctionType: "flag_missing", direction: "add_caution", allergen: "Sesame" }),
  ]);
  assert.equal(effective?.matchedAllergens.length, 1);
  assert.equal(effective?.matchedAllergens[0].allergenName, "Sesame");
  assert.equal(effective?.matchedAllergens[0].classification, "contains");
  assert.equal(effective?.matchedAllergens[0].severity, "severe");
});

test("wrong_product wins outright and clears everything, regardless of other corrections present", () => {
  const s = scan("contains_allergen", [
    { allergenName: "Milk", severity: "severe", classification: "contains" },
    { allergenName: "Soy", severity: "mild", classification: "caution" },
  ]);
  const effective = applyUserCorrections(s, [
    correction({ correctionType: "flag_wrong", direction: "remove_caution", allergen: "Milk" }),
    correction({ correctionType: "wrong_product", direction: "remove_caution", allergen: null }),
  ]);
  assert.equal(effective?.result, "unable_to_confirm");
  assert.deepEqual(effective?.matchedAllergens, []);
});

test("multiple corrections on different allergens each apply independently", () => {
  const s = scan("contains_allergen", [
    { allergenName: "Milk", severity: "severe", classification: "contains" },
    { allergenName: "Soy", severity: "mild", classification: "clear" },
  ]);
  const effective = applyUserCorrections(s, [
    correction({ correctionType: "flag_wrong", direction: "remove_caution", allergen: "Milk" }),
    correction({ correctionType: "flag_missing", direction: "add_caution", allergen: "Soy" }),
  ]);
  const milk = effective?.matchedAllergens.find((m) => m.allergenName === "Milk");
  const soy = effective?.matchedAllergens.find((m) => m.allergenName === "Soy");
  assert.equal(milk?.classification, "clear");
  assert.equal(soy?.classification, "contains");
  assert.equal(effective?.result, "contains_allergen"); // Soy's new "contains" still drives the rollup
});

test("an untouched 'unresolved' entry still drives unable_to_confirm in the recomputed rollup", () => {
  const s = scan("unable_to_confirm", [
    { allergenName: "Milk", severity: "severe", classification: "unresolved" },
    { allergenName: "Egg", severity: "moderate", classification: "clear" },
  ]);
  const effective = applyUserCorrections(s, [
    correction({ correctionType: "flag_wrong", direction: "remove_caution", allergen: "Egg" }),
  ]);
  // Egg was already clear, so the correction is a no-op on the rollup, but Milk's untouched
  // "unresolved" entry still means we can't call this safe.
  assert.equal(effective?.result, "unable_to_confirm");
});

test("never mutates the original scan's matchedAllergens array or its entries", () => {
  const originalEntry = { allergenName: "Milk", severity: "severe", classification: "contains" as const };
  const s = scan("contains_allergen", [originalEntry]);
  applyUserCorrections(s, [correction({ correctionType: "flag_wrong", direction: "remove_caution", allergen: "Milk" })]);
  assert.equal(originalEntry.classification, "contains"); // still the original, untouched
  assert.equal(s.matchedAllergens[0], originalEntry); // same reference, array wasn't replaced in place
});

test("the last correction in report order wins if the same user somehow has both directions on one allergen", () => {
  // The function trusts the caller's array order to be report order (oldest first) — it doesn't
  // sort by createdAt itself. scans.ts's query must ORDER BY created_at ASC for this to actually
  // mean "most recent wins" in practice; this test only proves the function's own last-write-wins
  // behavior, not the caller's ordering.
  const s = scan("contains_allergen", [{ allergenName: "Milk", severity: "severe", classification: "contains" }]);
  const effective = applyUserCorrections(s, [
    correction({ correctionType: "flag_missing", direction: "add_caution", allergen: "Milk", createdAt: "2026-09-10T00:00:00Z" }),
    correction({ correctionType: "flag_wrong", direction: "remove_caution", allergen: "Milk", createdAt: "2026-09-10T00:01:00Z" }),
  ]);
  assert.equal(effective?.matchedAllergens[0].classification, "clear");
});

test("a flag_wrong on a product the lookup never found doesn't lift unable_to_confirm to safe", () => {
  // Product not found → the matcher returns unable_to_confirm with an empty list. The correction
  // pushes a "clear" entry for the allergen, and a naive recompute read that as safe.
  const s = scan("unable_to_confirm", []);
  const effective = applyUserCorrections(s, [
    correction({ correctionType: "flag_wrong", direction: "remove_caution", allergen: "Milk" }),
  ]);
  assert.equal(effective?.result, "unable_to_confirm");
});

test("a flag_wrong after an AI failure doesn't lift the fail-closed unable_to_confirm to safe", () => {
  // mergeVerdict's ai.failed override: every allergen "clear", overall unable_to_confirm because
  // the AI step never ran successfully. Clearing one allergen says nothing about the rest.
  const s = scan("unable_to_confirm", [
    { allergenName: "Milk", severity: "severe", classification: "clear" },
    { allergenName: "Egg", severity: "moderate", classification: "clear" },
  ]);
  const effective = applyUserCorrections(s, [
    correction({ correctionType: "flag_wrong", direction: "remove_caution", allergen: "Egg" }),
  ]);
  assert.equal(effective?.result, "unable_to_confirm");
});

test("a flag_missing on a fail-closed scan still escalates to contains_allergen", () => {
  const s = scan("unable_to_confirm", []);
  const effective = applyUserCorrections(s, [
    correction({ correctionType: "flag_missing", direction: "add_caution", allergen: "Sesame" }),
  ]);
  assert.equal(effective?.result, "contains_allergen");
});

test("clearing the one 'unresolved' allergen that caused unable_to_confirm is still allowed on the user's own view", () => {
  const s = scan("unable_to_confirm", [
    { allergenName: "Milk", severity: "severe", classification: "unresolved" },
    { allergenName: "Egg", severity: "moderate", classification: "clear" },
  ]);
  const effective = applyUserCorrections(s, [
    correction({ correctionType: "flag_wrong", direction: "remove_caution", allergen: "Milk" }),
  ]);
  assert.equal(effective?.result, "safe");
});
