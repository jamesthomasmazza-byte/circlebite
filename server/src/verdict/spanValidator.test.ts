import assert from "node:assert/strict";
import { test } from "node:test";

import { validateSpan } from "./spanValidator.js";

const INGREDIENTS = "Water, sugar, WHEY POWDER (milk), natural flavoring, soy lecithin.";

test("accepts a verbatim substring", () => {
  assert.equal(validateSpan("sugar", INGREDIENTS), true);
});

test("accepts a case-insensitive match against differently-cased source text", () => {
  assert.equal(validateSpan("whey powder", INGREDIENTS), true);
});

test("accepts a cited span in a different case than the model returned it", () => {
  assert.equal(validateSpan("Soy Lecithin", INGREDIENTS), true);
});

test("rejects a paraphrase that isn't a literal substring", () => {
  assert.equal(validateSpan("contains dairy", INGREDIENTS), false);
});

test("rejects a synonym the model supplied instead of quoting the source", () => {
  // "dairy" never appears verbatim in INGREDIENTS even though "whey" and "milk" do.
  assert.equal(validateSpan("dairy", INGREDIENTS), false);
});

test("rejects an empty span", () => {
  assert.equal(validateSpan("", INGREDIENTS), false);
});

test("rejects a whitespace-only span", () => {
  assert.equal(validateSpan("   ", INGREDIENTS), false);
});

test("rejects a span not present at all", () => {
  assert.equal(validateSpan("peanuts", INGREDIENTS), false);
});
