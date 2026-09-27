import assert from "node:assert/strict";
import { test } from "node:test";

import type { ProductForMatching, ProfileAllergen } from "../matcher/match.js";
import { decideEvidenceNeeded } from "./scanPlan.js";

const MILD_ONLY: ProfileAllergen[] = [{ name: "Soy", severity: "mild", treatTracesAsUnsafe: false }];
const WITH_SEVERE: ProfileAllergen[] = [
  { name: "Milk", severity: "severe", treatTracesAsUnsafe: true },
  { name: "Soy", severity: "mild", treatTracesAsUnsafe: false },
];

const NOT_FOUND: ProductForMatching = { found: false, allergensTags: [], tracesTags: [], ingredientsText: null };
const THIN: ProductForMatching = { found: true, allergensTags: [], tracesTags: [], ingredientsText: "water, sugar, soy lecithin" };
const GOOD: ProductForMatching = {
  found: true,
  allergensTags: ["milk"],
  tracesTags: [],
  ingredientsText: "milk, sugar, cocoa",
};

test("no product record at all requires a photo (missing_data)", () => {
  assert.deepEqual(decideEvidenceNeeded(NOT_FOUND, WITH_SEVERE, "unable_to_confirm"), {
    photo: "required",
    reason: "missing_data",
  });
});

test("free ingredient text with no structured tags requires a photo (thin_data)", () => {
  assert.deepEqual(decideEvidenceNeeded(THIN, MILD_ONLY, "safe"), { photo: "required", reason: "thin_data" });
});

test("good data, no severe allergen, needs nothing", () => {
  assert.deepEqual(decideEvidenceNeeded(GOOD, MILD_ONLY, "safe"), { photo: "none" });
});

test("thin data plus a severe allergen is still required, not merely prompted", () => {
  assert.deepEqual(decideEvidenceNeeded(THIN, WITH_SEVERE, "safe"), { photo: "required", reason: "thin_data" });
});

test("a severe allergen prompts when the barcode came back safe", () => {
  assert.deepEqual(decideEvidenceNeeded(GOOD, WITH_SEVERE, "safe"), { photo: "prompted", reason: "severe_allergen" });
});

test("a severe allergen prompts when the barcode came back may_contain_caution", () => {
  assert.deepEqual(decideEvidenceNeeded(GOOD, WITH_SEVERE, "may_contain_caution"), {
    photo: "prompted",
    reason: "severe_allergen",
  });
});

test("a severe allergen skips the prompt when the barcode already says contains_allergen", () => {
  assert.deepEqual(decideEvidenceNeeded(GOOD, WITH_SEVERE, "contains_allergen"), { photo: "none" });
});
