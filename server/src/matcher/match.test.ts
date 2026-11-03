import assert from "node:assert/strict";
import { test } from "node:test";

import { allergenFamilyKey, allergenFoldKey, computeVerdict, matchAllergen, type ProductForMatching } from "./match.js";
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

test("recognizes wheat named without the word: durum, spelt, bulgur, seitan, semolina", () => {
  // Each from a real Open Food Facts product's ingredient text (2026-10-30), all but the last with
  // no allergen tags, or with "wheat" only inside a compound ("wholewheat", Dutch "tarwegluten") —
  // the matcher's silent misses on text alone. Each is matched by the new name itself.
  const real: [string, string][] = [
    ["spelt", "spelt flour, water, yeast, salt, dextrose."], // 8718906169890
    ["spelt", "Water, spelt, green lentils, long grain brown rice, extra virgin olive oil"], // 0099482455118
    ["bulgur", "Midyat bulgur"], // 8691440710172
    ["Durum", "Durum Wholewheat Semolina"], // 5000119319906
    ["seitan", "seitan* 90% [water, tarwegluten* 31%, tarwebloem*, sojavezel"], // 5400119593175
    ["semolina", "Organic wholewheat semolina"], // 8008343700665
  ];
  for (const [word, text] of real) {
    const result = matchAllergen("Wheat", productWithIngredients(text));
    assert.equal(result.matched, true, text);
    assert.equal(result.matchedText, word, text);
  }
});

test("wheat's other names are word-bounded and not aliases: buckwheat, farina and couscous stay misses", () => {
  // Farina is Italian for any flour; couscous can be corn. Both real products, both not wheat.
  for (const text of ["100% Farina di lenticchie rosse.", "Corn Couscous", "buckwheat groats", "spelter"]) {
    assert.equal(matchAllergen("Wheat", productWithIngredients(text)).matched, false, text);
  }
  // A profile allergen named "Spelt" keeps its own family key: the new names are keywords only.
  assert.equal(allergenFamilyKey("Spelt"), allergenFamilyKey("spelt"));
  assert.notEqual(allergenFamilyKey("Spelt"), allergenFamilyKey("Wheat"));
});

test("recognizes one-word wheat and its other names: wholewheat, wheatflour, wholemeal, emmer, bulgar", () => {
  // Real Open Food Facts ingredient text (2026-11-03, docs/evidence/2026-11-03-wheat-words.md), each a
  // miss on text alone before; the first three have no wheat or gluten tag either.
  const real: [string, string][] = [
    ["Wholewheat", "Wholewheat couscous."], // 29329724
    ["wholewheat", "milk, wholewheat flour, organic unrefined sugarcane, coconut powder, cashews"], // 8809020307500
    ["bulgar", "wholewheat bulgar"], // 5000169293201 (first keyword in list order wins)
    ["Wheatflour", "Wheatflour"], // 5010142008692
    ["Wholewheat", "Wholewheat Flour (89%), Water, Salt."], // 00322775
    ["wholewheat", "Shredded wholewheat(83%), sugar, humectant(sorbitol)"], // 5059319002781
  ];
  for (const [word, text] of real) {
    const result = matchAllergen("Wheat", productWithIngredients(text));
    assert.equal(result.matched, true, text);
    assert.equal(result.matchedText, word, text);
  }
  // Each new name on its own, from real labels with the word "wheat" taken out of the way.
  assert.equal(matchAllergen("Wheat", productWithIngredients("bulgar")).matchedText, "bulgar"); // 5000169293201
  assert.equal(matchAllergen("Wheat", productWithIngredients("Wholemeal Emmer Flour")).matched, true); // 5060149576069
  assert.equal(matchAllergen("Wheat", productWithIngredients("Emmer Flour")).matchedText, "Emmer");
  // Over-warns on the one non-wheat wholemeal found (9310023144034), accepted under principle 1.
  assert.equal(matchAllergen("Wheat", productWithIngredients("water, wholemeal rice flour (18%)")).matchedText, "wholemeal");
});

test("the new wheat words are word-bounded: buckwheat and longer words stay misses", () => {
  for (const text of ["buckwheat flour", "wholemeals", "Emmerich", "bulgaria", "wheatflours"]) {
    assert.equal(matchAllergen("Wheat", productWithIngredients(text)).matched, false, text);
  }
});

test("allergens Open Food Facts marks with underscores match, for every allergen, with the marks left out", () => {
  // Real Open Food Facts ingredient text (2026-11-03, docs/evidence/2026-11-03-underscore-allergens.md).
  // \b counts "_" as a letter, so each was a miss on text alone; the first five have no tag the
  // matcher can read either (OFF's "sesame-seeds" and "sulphur-dioxide-and-sulphites" equal no keyword).
  const real: [string, string, string][] = [
    ["Sesame", "84% Wholegrain _Rye_ Flour, _Rye_ Flour, 12% _Sesame_ Seeds, Salt.", "Sesame"], // 40874302
    ["Sulphites", "Dried Mango, Preservative (_Sulphur Dioxide_).", "Sulphur Dioxide"], // 10067819
    ["Sulphites", "White Wine Vinegar (_Sulphites_), Dried Garlic.", "Sulphites"], // 5012818160154
    ["Sulphites", "Chickpeas, Water, Antioxidant (_Sodium Metabisulphite_).", "Metabisulphite"], // 5000232844217
    ["Sesame", "_WHEAT_ Flour (_WHEAT_ Flour, Calcium Carbonate, Folic Acid), Water, _SESAME_ Seeds (4%)", "SESAME"], // 5020364010151
    ["Wheat", "Wholegrain _Wheat_ (95%), Malted _Barley_ Extract, Sugar, Salt", "Wheat"], // 5010029000801
    ["Milk", "Natural Yogurt (_Milk_, Cream (_Milk_)), Yogurt Cultures", "Milk"], // 4088600060880
    ["Peanuts", "Roasted _Peanuts_ (100%).", "Peanuts"], // 5014213711290
    ["Soy", "emulsifier: lecithins (_SOYA_), vanillin.", "SOYA"], // 5020411121151
    ["Hazelnut", "Sugar, palm oil, _HAZELNUTS_ (13%), skimmed _milk_ powder", "HAZELNUTS"], // 5020411121151
    ["Fish", "Alaska Pollock 65% (_Fish_), _Wheat_ Flour, Sunflower Oil", "Fish"], // 4056489431039
    ["Celery", "Spice and Herb Extracts (contain _Celery_), Spice", "Celery"], // 50457236
  ];
  for (const [allergen, text, quoted] of real) {
    const result = matchAllergen(allergen, productWithIngredients(text));
    assert.equal(result.matched, true, text);
    assert.equal(result.source, "ingredients", text);
    assert.equal(result.matchedText, quoted, text);
  }
});

test("underscores are boundaries, not a way into a longer word: letters and digits still join", () => {
  for (const text of ["_buckwheat_ groats", "_coconuts_", "_doughnuts_", "_spelter_"]) {
    assert.equal(matchAllergen("Wheat", productWithIngredients(text)).matched, false, text);
    assert.equal(matchAllergen("Peanut", productWithIngredients(text)).matched, false, text);
    assert.equal(matchAllergen("Tree nuts", productWithIngredients(text)).matched, false, text);
  }
  assert.equal(matchAllergen("Sulphites", productWithIngredients("_e2201_")).matched, false);
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

// Barcode 096619160761, production 2026-10-16: tagged "nuts" (Open Food Facts' tree-nut tag) in
// both allergens and traces. With the ingredient text left out, the tag alone must be enough.
test("Open Food Facts' 'nuts' tag is a tree nut — tags only, no ingredient text to fall back on", () => {
  const product: ProductForMatching = { found: true, allergensTags: ["milk", "nuts", "peanuts", "soybeans", "coconut"], tracesTags: ["eggs", "nuts"], ingredientsText: null };
  assert.deepEqual(matchAllergen("Tree nuts", product), { allergenName: "Tree nuts", matched: true, source: "tag" });
  assert.deepEqual(matchAllergen("tree nut", { ...product, allergensTags: [] }), { allergenName: "tree nut", matched: true, source: "trace" });
});

test("'nuts' only adds matches: a single nut too (it doesn't say which), never peanut, never inside peanuts or doughnuts", () => {
  const tagged: ProductForMatching = { found: true, allergensTags: ["nuts"], tracesTags: [], ingredientsText: null };
  assert.equal(matchAllergen("Walnut", tagged).matched, true, "unspecified nuts could be walnut — principle 1");
  assert.equal(matchAllergen("Walnut", productWithIngredients("cashews, salt")).matched, false, "a named different nut still isn't walnut");
  assert.equal(matchAllergen("Peanut", tagged).matched, false);
  assert.equal(matchAllergen("Tree nuts", productWithIngredients("roasted peanuts, doughnuts, coconuts")).matched, false);
  assert.equal(matchAllergen("Tree nuts", productWithIngredients("mixed nuts, salt")).matchedText, "nuts");
});

test("Open Food Facts' sesame, sulphite and mollusc tags are read, as they come from openFoodFacts.ts", () => {
  // Real products (2026-11-03, docs/evidence/2026-11-03-tag-gap.md), tags normalized as stored and the
  // text that came with them. Each read "No listed allergens found" for that allergen before: its only
  // mention was a tag no keyword equalled. Traces not treated as unsafe, the default shape.
  const real: [string, string, ProductForMatching, "contains" | "caution"][] = [
    // 4088600108063 Rich Tea: sesame only in the traces.
    ["Rich Tea", "Sesame", { found: true, allergensTags: ["gluten"], tracesTags: ["milk", "sesame seeds"], ingredientsText: "Wheat Flour, Sugar, Palm Oil, Invert Sugar Syrup, Raising Agents: Sodium Carbonates, Ammonium Carbonates; Salt." }, "caution"],
    // 4033634061020 Organic Crisp Bread: sesame as an allergen, text not given here.
    ["Organic Crisp Bread", "Sesame", { found: true, allergensTags: ["sesame seeds"], tracesTags: [], ingredientsText: null }, "contains"],
    // 20815394 Mix di frutta secca: Italian text, the sulphites only in the tag.
    ["Mix di frutta secca", "Sulphites", { found: true, allergensTags: ["nuts", "peanuts", "sulphur dioxide and sulphites"], tracesTags: ["nuts", "peanuts"], ingredientsText: "25% noci, 25% mandorle, 25% uva sultanina (99,5% uva sultanina, olio di semi di girasole), 25% mirtilli rossi americani" }, "contains"],
    // 5997523315511 Soba Wok Style: molluscs as an allergen.
    ["Soba Wok Style", "Molluscs", { found: true, allergensTags: ["crustaceans", "fish", "gluten", "milk", "molluscs", "mustard", "sesame seeds", "soybeans"], tracesTags: [], ingredientsText: "noodles 72,3%: wheat flour, palm oil salt, flavour enhancer e621" }, "contains"],
    // 4056489127284 Bami Goreng: molluscs only in the traces, German text.
    ["Bami Goreng", "Molluscs", { found: true, allergensTags: ["gluten", "soybeans"], tracesTags: ["celery", "crustaceans", "fish", "milk", "molluscs", "mustard"], ingredientsText: "39% gegarte Nudeln (Wasser, Hartweizenmehl)." }, "caution"],
  ];
  for (const [product, allergen, data, expected] of real) {
    const { matchedAllergens } = computeVerdict([{ name: allergen, severity: "severe", treatTracesAsUnsafe: false }], data);
    assert.equal(matchedAllergens[0].classification, expected, product);
  }
});

test("a tag we trust can be wrong: Nutritional Yeast Flakes is tagged sulphites, and now warns", () => {
  // 5016084000374. Its text names "Zinc sulfate", and sulfate isn't sulphite, so the tag is probably
  // Open Food Facts' mistake. A false caution, accepted: the matcher trusts every tag the same way
  // (principle 1), and no text keyword fires here, so the warning is the tag's alone.
  const yeast: ProductForMatching = {
    found: true,
    allergensTags: ["celery", "milk", "mustard", "soybeans", "sulphur dioxide and sulphites"],
    tracesTags: [],
    ingredientsText: "Dried inactive yeast (99%), Thiamine (B1), Riboflavin (B2), Niacin (B3), Cyanocobalamin (B12), Zinc sulfate.",
  };
  assert.deepEqual(matchAllergen("Sulphites", yeast), { allergenName: "Sulphites", matched: true, source: "tag" });
  assert.equal(matchAllergen("Sulphites", { ...yeast, allergensTags: [] }).matched, false, "the text alone says sulfate");
});

test("the tag spellings add no correction keys: a 'Molluscs' or 'Sesame' profile keeps its family key", () => {
  assert.equal(allergenFamilyKey("Molluscs"), "cluster:mollusc");
  assert.equal(allergenFamilyKey("Sesame seeds"), "name:sesame seed");
  assert.notEqual(allergenFamilyKey("Sulphur dioxide and sulphites"), allergenFamilyKey("Sulphites"));
});
