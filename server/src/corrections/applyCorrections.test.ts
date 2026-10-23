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

// docs/verdict-engine.md principle 6, amended 2026-10-23: a removal is noted on the reporter's own
// row, never applied to it. One pending report had turned this card green.
test("flag_wrong marks the allergen as disputed and changes neither the row nor the headline", () => {
  const s = scan("contains_allergen", [{ allergenName: "Milk", severity: "severe", classification: "contains" }]);
  const effective = applyUserCorrections(s, [
    correction({ correctionType: "flag_wrong", direction: "remove_caution", allergen: "Milk" }),
  ]);
  assert.equal(effective?.result, "contains_allergen");
  assert.equal(effective?.matchedAllergens[0].classification, "contains");
  assert.equal(effective?.matchedAllergens[0].disputedByYou, "pending");
});

test("a removal corroborated by three families is still only noted — no reviewer has accepted it", () => {
  const s = scan("may_contain_caution", [{ allergenName: "Sesame", severity: "moderate", classification: "caution" }]);
  const effective = applyUserCorrections(s, [
    correction({ correctionType: "flag_wrong", direction: "remove_caution", allergen: "Sesame", status: "corroborated" }),
  ]);
  assert.equal(effective?.result, "may_contain_caution");
  assert.equal(effective?.matchedAllergens[0].classification, "caution");
  assert.equal(effective?.matchedAllergens[0].disputedByYou, "corroborated");
});

test("no removal that hasn't been rejected can lower the headline or any row, in any starting state", () => {
  const verdicts = ["contains_allergen", "may_contain_caution", "unable_to_confirm", "safe"];
  const classes = ["contains", "caution", "unresolved", "clear", "unchecked"] as const;
  for (const result of verdicts) {
    for (const a of classes) {
      for (const b of classes) {
        const rows = [
          { allergenName: "Milk", severity: "severe", classification: a },
          { allergenName: "Egg", severity: "mild", classification: b },
        ];
        for (const status of ["pending", "corroborated"] as const) {
          for (const target of ["Milk", "Egg", "Peanut"]) {
            const effective = applyUserCorrections(scan(result, rows), [
              correction({ correctionType: "flag_wrong", direction: "remove_caution", allergen: target, status }),
            ]);
            const where = `${result} / ${a},${b} / ${status} on ${target}`;
            assert.equal(effective?.result, result, where);
            if (result !== "safe") assert.notEqual(effective?.result, "safe", where);
            assert.deepEqual(
              effective?.matchedAllergens.map((m) => m.classification),
              [a, b],
              where,
            );
          }
        }
      }
    }
  }
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
  assert.equal(milk?.classification, "contains");
  assert.equal(milk?.disputedByYou, "pending");
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
  // The later removal is noted on the row, which stays "contains".
  assert.equal(effective?.matchedAllergens[0].classification, "contains");
  assert.equal(effective?.matchedAllergens[0].disputedByYou, "pending");
});

test("an addition after a removal on the same allergen lifts the dispute mark", () => {
  const s = scan("may_contain_caution", [{ allergenName: "Milk", severity: "severe", classification: "caution" }]);
  const effective = applyUserCorrections(s, [
    correction({ correctionType: "flag_wrong", direction: "remove_caution", allergen: "Milk", createdAt: "2026-09-10T00:00:00Z" }),
    correction({ id: "c2", correctionType: "flag_missing", direction: "add_caution", allergen: "Milk", createdAt: "2026-09-10T00:01:00Z" }),
  ]);
  assert.equal(effective?.matchedAllergens[0].classification, "contains");
  assert.equal(effective?.matchedAllergens[0].disputedByYou, undefined);
  assert.equal(effective?.result, "contains_allergen");
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

test("disputing a real 'contains' on a Path C scan leaves it, and the 'unchecked' rows, exactly as they were", () => {
  // The exact scenario found while auditing this duplicated rollup logic: a photo-sourced scan
  // where Peanut genuinely matched and four other allergens were never actually checked. The user
  // disputes Peanut as wrongly flagged; the other four were never touched by any correction and
  // must not silently read as safe.
  const s = scan("contains_allergen", [
    { allergenName: "Peanut", severity: "severe", classification: "contains" },
    { allergenName: "Almond", severity: "severe", classification: "unchecked" },
    { allergenName: "Milk", severity: "severe", classification: "unchecked" },
    { allergenName: "Sesame", severity: "moderate", classification: "unchecked" },
    { allergenName: "Soy", severity: "mild", classification: "unchecked" },
  ]);
  const effective = applyUserCorrections(s, [
    correction({ correctionType: "flag_wrong", direction: "remove_caution", allergen: "Peanut" }),
  ]);
  assert.equal(effective?.result, "contains_allergen");
  assert.equal(effective?.matchedAllergens.find((m) => m.allergenName === "Peanut")?.classification, "contains");
  const almond = effective?.matchedAllergens.find((m) => m.allergenName === "Almond");
  assert.equal(almond?.classification, "unchecked"); // untouched by the correction, still honest
});

// Superseded 2026-10-23 (docs/principles.md): this used to be allowed to read "safe" on the
// reporter's own view. A report that the allergen isn't there no longer resolves anything.
test("disputing the one 'unresolved' allergen that caused unable_to_confirm leaves the card unable to confirm", () => {
  const s = scan("unable_to_confirm", [
    { allergenName: "Milk", severity: "severe", classification: "unresolved" },
    { allergenName: "Egg", severity: "moderate", classification: "clear" },
  ]);
  const effective = applyUserCorrections(s, [
    correction({ correctionType: "flag_wrong", direction: "remove_caution", allergen: "Milk" }),
  ]);
  assert.equal(effective?.result, "unable_to_confirm");
  assert.equal(effective?.matchedAllergens[0].classification, "unresolved");
  assert.equal(effective?.matchedAllergens[0].disputedByYou, "pending");
});

// docs/principles.md principle 1, decided 2026-09-29: rejection is judged by direction. A rejected
// removal stops clearing the reporter's own view — an admin looked at the photo and said no — while
// a rejected addition keeps warning the family who read the package themselves.
test("a rejected flag_wrong no longer clears the allergen on the reporter's own view", () => {
  const s = scan("contains_allergen", [{ allergenName: "Sesame", severity: "severe", classification: "contains" }]);
  const effective = applyUserCorrections(s, [
    correction({ correctionType: "flag_wrong", direction: "remove_caution", allergen: "Sesame", status: "rejected" }),
  ]);
  assert.equal(effective, null);
});

test("a rejected wrong_product no longer clears everything on the reporter's own view", () => {
  const s = scan("contains_allergen", [{ allergenName: "Milk", severity: "severe", classification: "contains" }]);
  const effective = applyUserCorrections(s, [
    correction({ correctionType: "wrong_product", direction: "remove_caution", status: "rejected" }),
    correction({ id: "c2", correctionType: "flag_missing", direction: "add_caution", allergen: "Egg" }),
  ]);
  assert.equal(effective?.result, "contains_allergen");
  assert.equal(effective?.matchedAllergens.find((m) => m.allergenName === "Milk")?.classification, "contains");
});

test("a rejected flag_missing still warns the reporter's own view", () => {
  const s = scan("safe", [{ allergenName: "Sesame", severity: "severe", classification: "clear" }]);
  const effective = applyUserCorrections(s, [
    correction({ correctionType: "flag_missing", direction: "add_caution", allergen: "Sesame", status: "rejected" }),
  ]);
  assert.equal(effective?.result, "contains_allergen");
});
