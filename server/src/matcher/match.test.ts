import assert from "node:assert/strict";
import { test } from "node:test";

import { allergenFamilyKey, allergenFoldKey, matchAllergen, type ProductForMatching } from "./match.js";
import { SYNONYM_CLUSTERS } from "./synonyms.js";

function productWithIngredients(ingredientsText: string): ProductForMatching {
  return { found: true, allergensTags: [], tracesTags: [], ingredientsText };
}

/**
 * The word-boundary regex in matchAllergen (\bkeyword\b) only fires when a keyword appears as its
 * own token — it silently misses a real ingredient word that has the keyword embedded as a prefix
 * or suffix of a single compound word (no boundary between two word characters). Found via a real
 * AI escalation on barcode 0050000328420 (docs/journal.md 2026-09-10): "sodium caseinate" wasn't
 * recognized as milk. Every case below is confirmed against real ingredient text from a real
 * Open Food Facts product before being added as a fix, not invented.
 */
test("recognizes 'caseinate' as milk — barcode 0050000328420, the case that surfaced this bug class", () => {
  const text =
    "water, sugar, vegetable oil, (high oleic soybean and/or high oleic canola), and less than 2% of sodium caseinate, mono-and diglycerides, dipotassium phosphate, natural and artificial flavors, cellulose gel, cellulose gum, carrageenan";
  assert.deepEqual(matchAllergen("Milk", productWithIngredients(text)), {
    allergenName: "Milk",
    matched: true,
    source: "ingredients",
    matchedText: "caseinate",
  });
});

test("matchedText is sliced verbatim from the ingredient text — the source's own casing, never the keyword", () => {
  // The card quotes this as the thing to look for on the package, so it must be real text.
  const text = "Rolled Oats, ALMONDS, Honey";
  const result = matchAllergen("Tree nut", productWithIngredients(text));
  assert.equal(result.source, "ingredients");
  assert.ok(result.matchedText);
  assert.ok(text.includes(result.matchedText!), `"${result.matchedText}" is not a substring of the text`);
  assert.equal(result.matchedText, result.matchedText!.toUpperCase());
});

test("tag and trace matches carry no matchedText — there is no source text to quote", () => {
  const product = { found: true, allergensTags: ["peanuts"], tracesTags: ["eggs"], ingredientsText: null };
  assert.equal(matchAllergen("Peanut", product).source, "tag");
  assert.equal(matchAllergen("Peanut", product).matchedText, undefined);
  assert.equal(matchAllergen("Egg", product).source, "trace");
  assert.equal(matchAllergen("Egg", product).matchedText, undefined);
});

test("recognizes 'buttermilk' as milk", () => {
  // From a real buttermilk pancake mix's ingredient list.
  const text = "wheat protein isolate, brown sugar, buttermilk powder, leavening, sea salt";
  assert.equal(matchAllergen("Milk", productWithIngredients(text)).matched, true);
});

test("recognizes 'soymilk' (one word) as soy", () => {
  // From a real "Organic Unsweetened Soymilk" product's own ingredient list.
  const text = "organic soymilk (filtered water, organic soybeans), vitamin and mineral blend";
  assert.equal(matchAllergen("Soy", productWithIngredients(text)).matched, true);
});

test("recognizes 'crabmeat' (one word) as crustacean", () => {
  // From a real "imitation crabmeat" ingredient in a seafood salad.
  const text = "imitation crabmeat (fish protein (pollock, cod, and/or pacific whiting)), wheat starch";
  assert.equal(matchAllergen("Crustacean", productWithIngredients(text)).matched, true);
});

test("recognizes 'bisulfite' and 'metabisulfite' as sulfite", () => {
  // From real products: bare "sodium bisulfite" (citrus juice preservative) and "sodium
  // metabisulfite" (dried-fruit preservative) — different compounds, same missed-boundary bug.
  const bisulfite = "filtered water, lemon juice concentrate, sodium bisulfite (preservative), lemon oil";
  const metabisulfite = "papaya, sugar, sodium metabisulfite (as preservative), yellow 6";
  assert.equal(matchAllergen("Sulfite", productWithIngredients(bisulfite)).matched, true);
  assert.equal(matchAllergen("Sulfite", productWithIngredients(metabisulfite)).matched, true);
});

test("recognizes 'eggnog' (one word) as egg", () => {
  // From a real gelato's ingredient list: "Eggnog (milk, cane sugar, egg yolks, ...)". Note the
  // real product also separately says "egg yolks" later in the same string, which would pass this
  // test on its own — this case is isolated deliberately to prove "eggnog" itself is recognized,
  // not just riding along on a second, unrelated mention of "egg" in the same text.
  const text = "eggnog, cane sugar, natural flavour, salt";
  assert.equal(matchAllergen("Egg", productWithIngredients(text)).matched, true);
});

test("regression: a product with none of these terms is still a clean miss", () => {
  const text =
    "CARBONATED WATER, CARAMEL COLOR, ASPARTAME acts PHOSPHORIC ACID, POTASSIUM BENZOATE, NATURAL FLAVORS, CITRIC ACID, CAFFEINE";
  assert.equal(matchAllergen("Milk", productWithIngredients(text)).matched, false);
  assert.equal(matchAllergen("Soy", productWithIngredients(text)).matched, false);
  assert.equal(matchAllergen("Sulfite", productWithIngredients(text)).matched, false);
});

test("allergenFoldKey and allergenFamilyKey: case, surrounding space and a trailing s don't change either key", () => {
  for (const key of [allergenFoldKey, allergenFamilyKey]) {
    assert.equal(key("Peanut"), key("peanut"));
    assert.equal(key("Peanut"), key("  PEANUTS "));
    // An allergen no cluster knows: literal name, singular.
    assert.equal(key("Kiwi"), key("kiwis"));
  }
  assert.equal(allergenFoldKey("Kiwis"), "kiwi");
});

test("allergenFamilyKey: every alias in a synonym cluster shares one key, the cluster's id", () => {
  assert.equal(allergenFamilyKey("Milk"), allergenFamilyKey("Dairy"));
  assert.equal(allergenFamilyKey("Groundnuts"), allergenFamilyKey("Peanut"));
  for (const cluster of SYNONYM_CLUSTERS) {
    for (const alias of cluster.aliases) assert.equal(allergenFamilyKey(alias), `cluster:${cluster.id}`, alias);
  }
});

test("allergenFoldKey never merges a synonym cluster — a removal must be about the same thing", () => {
  assert.notEqual(allergenFoldKey("Milk"), allergenFoldKey("Lactose"));
  assert.notEqual(allergenFoldKey("Milk"), allergenFoldKey("Whey"));
  assert.notEqual(allergenFoldKey("Peanut"), allergenFoldKey("Groundnut"));
});

test("cluster ids are unique, and no free-text name can land on a cluster's family key", () => {
  const ids = SYNONYM_CLUSTERS.map((c) => c.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(allergenFamilyKey("Kiwi"), "name:kiwi");
  assert.equal(allergenFamilyKey("cluster:dairy"), "name:cluster:dairy");
  assert.notEqual(allergenFamilyKey("cluster:dairy"), allergenFamilyKey("Dairy"));
});

test("reordering a cluster's aliases doesn't change its family key", () => {
  const dairy = SYNONYM_CLUSTERS.find((c) => c.id === "dairy")!;
  const before = allergenFamilyKey("Whey");
  dairy.aliases.reverse();
  try {
    assert.equal(allergenFamilyKey("Whey"), before);
  } finally {
    dairy.aliases.reverse();
  }
});

test("different allergens keep different keys of both kinds", () => {
  for (const key of [allergenFoldKey, allergenFamilyKey]) {
    assert.notEqual(key("Peanut"), key("Tree nut"));
    assert.notEqual(key("Tree nuts"), key("Walnut"), "the umbrella and a single nut are separate claims");
    assert.notEqual(key("Fish"), key("Shellfish"));
    assert.notEqual(key("Kiwi"), key("Kiwano"));
  }
});
