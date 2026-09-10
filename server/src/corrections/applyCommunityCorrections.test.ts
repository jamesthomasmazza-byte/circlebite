import assert from "node:assert/strict";
import { test } from "node:test";

import type { ScanForCorrection } from "./applyCorrections.js";
import { allergensOverlap, applyCommunityCorrections, type CommunityAddition } from "./applyCommunityCorrections.js";

// Invented data only — no real people, profiles, or products (AGENTS.md).

function scan(result: string, matchedAllergens: ScanForCorrection["matchedAllergens"]): ScanForCorrection {
  return { result, matchedAllergens };
}

function addition(allergen: string, reporterCount = 1, id = `corr-${allergen}`): CommunityAddition {
  return { allergen, correctionIds: [id], reporterCount };
}

test("allergensOverlap: spelling and plural differences still match", () => {
  assert.equal(allergensOverlap("Peanuts", "peanut"), true);
  assert.equal(allergensOverlap("  Sesame ", "sesame"), true);
});

test("allergensOverlap: synonym clusters match across profiles", () => {
  assert.equal(allergensOverlap("Milk", "Dairy"), true);
  assert.equal(allergensOverlap("Wheat", "Gluten"), true);
});

test("allergensOverlap: the tree-nut umbrella matches in both directions", () => {
  assert.equal(allergensOverlap("Walnut", "Tree Nuts"), true); // a specific nut reaches the umbrella
  assert.equal(allergensOverlap("Tree Nuts", "Walnut"), true); // an unspecified nut reaches each nut
});

test("allergensOverlap: never conflates peanut with tree nuts, fish with shellfish, or two different nuts", () => {
  assert.equal(allergensOverlap("Peanut", "Tree Nuts"), false);
  assert.equal(allergensOverlap("Fish", "Shellfish"), false);
  assert.equal(allergensOverlap("Walnut", "Cashew"), false);
});

test("returns null when there are no corroborated additions for this barcode", () => {
  const s = scan("safe", [{ allergenName: "Sesame", severity: "severe", classification: "clear" }]);
  assert.equal(applyCommunityCorrections(s, [{ name: "Sesame", severity: "severe" }], []), null);
});

test("returns null when no addition matches an allergen on this profile", () => {
  const s = scan("safe", [{ allergenName: "Egg", severity: "mild", classification: "clear" }]);
  assert.equal(applyCommunityCorrections(s, [{ name: "Egg", severity: "mild" }], [addition("Sesame")]), null);
});

test("escalates a clear allergen to contains and marks it community-reported", () => {
  const s = scan("safe", [{ allergenName: "Sesame", severity: "moderate", classification: "clear" }]);
  const effective = applyCommunityCorrections(s, [{ name: "Sesame", severity: "moderate" }], [addition("sesame", 2)]);
  assert.equal(effective?.result, "contains_allergen");
  assert.equal(effective?.matchedAllergens[0].classification, "contains");
  assert.equal(effective?.matchedAllergens[0].communityReported, true);
  assert.equal(effective?.matchedAllergens[0].communityReporterCount, 2);
  assert.deepEqual(effective?.applied, [
    { allergenName: "Sesame", reportedAs: ["sesame"], correctionIds: ["corr-sesame"], reporterCount: 2 },
  ]);
});

test("escalates a trace-level caution to contains — a community report is a direct ingredient, not a trace", () => {
  const s = scan("may_contain_caution", [{ allergenName: "Milk", severity: "mild", classification: "caution" }]);
  const effective = applyCommunityCorrections(s, [{ name: "Milk", severity: "mild" }], [addition("Dairy")]);
  assert.equal(effective?.result, "contains_allergen");
  assert.equal(effective?.matchedAllergens[0].classification, "contains");
});

test("leaves an allergen the label already flagged as contains alone, and reports nothing applied", () => {
  const s = scan("contains_allergen", [{ allergenName: "Peanut", severity: "severe", classification: "contains" }]);
  assert.equal(applyCommunityCorrections(s, [{ name: "Peanut", severity: "severe" }], [addition("Peanuts")]), null);
});

test("adds an entry with this profile's own severity when the product wasn't found", () => {
  const s = scan("unable_to_confirm", []);
  const effective = applyCommunityCorrections(s, [{ name: "Tree Nuts", severity: "severe" }], [addition("Walnut")]);
  assert.equal(effective?.result, "contains_allergen");
  assert.equal(effective?.matchedAllergens.length, 1);
  assert.equal(effective?.matchedAllergens[0].allergenName, "Tree Nuts");
  assert.equal(effective?.matchedAllergens[0].severity, "severe");
  assert.equal(effective?.matchedAllergens[0].classification, "contains");
});

test("an 'unresolved' AI finding is escalated, not left as unable_to_confirm", () => {
  const s = scan("unable_to_confirm", [{ allergenName: "Milk", severity: "severe", classification: "unresolved" }]);
  const effective = applyCommunityCorrections(s, [{ name: "Milk", severity: "severe" }], [addition("Milk")]);
  assert.equal(effective?.result, "contains_allergen");
});

test("takes the max reporter count, not the sum, when several spellings match one allergen", () => {
  const s = scan("safe", [{ allergenName: "Peanut", severity: "severe", classification: "clear" }]);
  const effective = applyCommunityCorrections(
    s,
    [{ name: "Peanut", severity: "severe" }],
    [addition("Peanut", 2, "c1"), addition("Peanuts", 1, "c2")],
  );
  assert.equal(effective?.matchedAllergens[0].communityReporterCount, 2);
  assert.deepEqual(effective?.applied[0].correctionIds, ["c1", "c2"]);
});

test("never clears or downgrades anything — allergens no addition matches keep their classification", () => {
  const s = scan("may_contain_caution", [
    { allergenName: "Soy", severity: "mild", classification: "caution" },
    { allergenName: "Egg", severity: "moderate", classification: "clear" },
  ]);
  const effective = applyCommunityCorrections(
    s,
    [
      { name: "Soy", severity: "mild" },
      { name: "Egg", severity: "moderate" },
    ],
    [addition("Egg")],
  );
  assert.equal(effective?.matchedAllergens.find((m) => m.allergenName === "Soy")?.classification, "caution");
  assert.equal(effective?.matchedAllergens.find((m) => m.allergenName === "Egg")?.classification, "contains");
});

test("never mutates the original scan's entries", () => {
  const original = { allergenName: "Sesame", severity: "severe", classification: "clear" as const };
  const s = scan("safe", [original]);
  applyCommunityCorrections(s, [{ name: "Sesame", severity: "severe" }], [addition("Sesame")]);
  assert.equal(original.classification, "clear");
  assert.equal("communityReported" in original, false);
});
