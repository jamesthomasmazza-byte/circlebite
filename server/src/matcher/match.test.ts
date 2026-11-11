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

// The full Open Food Facts audit (2026-11-10, docs/evidence/2026-11-10-off-full-audit.md): 605,512
// products with English ingredient text, run through this matcher at ab949a3. Every label below is a
// real product's ingredient text from the audit files, with its barcode; each read clear for the
// allergen before the word was added. Classification is from computeVerdict with the default profile
// shape (traces not treated as unsafe), the way the card gets it.
function classify(allergen: string, text: string): "contains" | "caution" | "clear" {
  return computeVerdict([{ name: allergen, severity: "severe", treatTracesAsUnsafe: false }], productWithIngredients(text)).matchedAllergens[0].classification;
}

test("butter and cream are milk, except as peanut butter, cocoa butter, coconut cream and cream of tartar", () => {
  // Milk: 0085582012740 (Butter Toffee Peanuts), 0041231000131 (a salted butter), 0011110457219 (a tiramisu).
  assert.equal(classify("Milk", "Peanuts, sugar, butter (cream, salt), and salt."), "contains");
  assert.equal(matchAllergen("Milk", productWithIngredients("Peanuts, sugar, butter (cream, salt), and salt.")).matchedText, "butter");
  assert.equal(classify("Milk", "Grade a cream, sea salt."), "contains");
  assert.equal(matchAllergen("Milk", productWithIngredients("Grade a cream, sea salt.")).matchedText, "cream");
  assert.equal(classify("Milk", "HEAVY CREAM (HEAVY CREAM, CARRAGEENAN, MONO - AND DIGLYCERIDES), SUGAR, WATER"), "contains");
  // Not milk: 0048001159945 (a peanut butter spread), 0041376111457 (its first three ingredients; the
  // fourth is MILK), 0009073102079 (a sorbet), 0011110803122 (a sweetener).
  assert.equal(classify("Milk", "PEANUT BUTTER, SPREAD (ROASTED PEANUTS, PALM OIL, PEANUT OIL, SALT), SUGAR, HONEY."), "clear");
  assert.equal(classify("Milk", "SUGAR, COCOA BUTTER, CHOCOLATE LIQUOR"), "clear");
  assert.equal(classify("Milk", "Coconut cream, water, sugar, dutch cocoa, pectin, guar."), "clear");
  assert.equal(classify("Milk", "DEXTROSE WITH MALTODEXTRIN, 3.6% SODIUM SACCHARIN, CREAM OF TARTAR, CALCIUM SILICATE (ANTI-CAKING AGENT)"), "clear");
  // The other guarded butters, and the guard skipping one use at a time: the second "butter" fires.
  // The guard's second wave, from the first full-export run (0013964365429 "Stone-ground cacao*, cacao
  // butter*, coconut palm sugar."; "Butyrospermum Parkii Butter" in a cosmetic; coconut, sesame and
  // hazelnut butters), then the first list.
  for (const text of ["Stone-ground cacao*, cacao butter*, coconut palm sugar.", "Aqua, Butyrospermum Parkii Butter, Dicaprylyl Carbonate", "coconut butter", "sesame butter", "hazelnut butter"]) {
    assert.equal(classify("Milk", text), "clear", text);
  }
  for (const text of ["almond butter", "cashew butter", "shea butter", "apple butter", "sunflower seed butter", "nut butter", "_Peanut_ butter", "peanut-butter"]) {
    assert.equal(classify("Milk", text), "clear", text);
  }
  assert.equal(matchAllergen("Milk", productWithIngredients("peanut butter, sugar, butter, salt")).matchedText, "butter");
  assert.equal(matchAllergen("Milk", productWithIngredients("coconut cream, cream of tartar, Sour Cream")).matchedText, "Cream");
  // Longer words aren't the keyword: buttermilk and butterfat are their own keywords, creamer isn't.
  assert.equal(classify("Milk", "creamer, creamy coconut butterscotch"), "clear");
});

test("milk by other names: cheese, yogurt, yoghurt, curd, curds, kefir, ghee, paneer, butterfat", () => {
  const real: [string, string][] = [
    ["CHEESE", "PASTEURIZED MIL, CHEESE CULTURES, SALT, ENZYMES, ANNATTO (VEGETABLE COLOR)."], // 0021130043965
    ["Yogurt", "Fat Free Greek Style Yogurt (MK) (87%) - Honey (5%) - Sugar"], // 00374613
    ["yoghurt", "stabilizer (locust bean gum), salt, citroensapconcentraat, flavouring, yoghurt ulturen"], // 23062733
    ["curds", "salt, cheese curds (microbial), lactic acid culture,".replace("cheese ", "")], // 5711953084690, with "pasteurized milk" and "cheese" taken out of the way (both are matched first)
    ["curd", "salt, curd, lactic acid culture"], // the word alone; the real labels (5711953084690) have milk or cheese first
    ["kefir", "Love, purified water, rawk star creations kefir culture, organic evaporated cane juice"], // 0704550279151, "kefir culture": ambiguous, so it warns
    ["Ghee", "Water, Rapeseed Oil, Yeast, Vegetable Ghee (Palm Oil, Rapeseed Oil), Spirit Vinegar"], // 01674361, an over-warn: no milk in vegetable ghee
    ["Paneer", "Spinach, Water, Tofu (Soya Paneer (Soya beans, Water, Citric Acid, Salt)), Onions"], // 8901552021371, an over-warn: soya paneer is tofu
    ["butterfat", "Wheat flour, salted fat (13%) (butterfat, water, salt), sugar"], // 0010318002757, "butter" taken out of the way
  ];
  for (const [word, text] of real) {
    const result = matchAllergen("Milk", productWithIngredients(text));
    assert.equal(result.matched, true, text);
    assert.equal(result.matchedText, word, text);
  }
  for (const text of ["cheesecloth", "yogurts", "curdled", "kefiran", "gheen", "paneers", "butterfats"]) {
    assert.equal(classify("Milk", text), "clear", text);
  }
});

test("bean curd is tofu, water kefir is a soda: neither is milk, and bean curd is soy", () => {
  const beanCurd = "Bamboo shoots, carrot, burdock root, shiitake black mushrooms, dried bean curd (water, salt, calcium chloride)"; // 0011152000671, with "soybeans" taken out of the way
  assert.equal(classify("Milk", beanCurd), "clear");
  assert.equal(matchAllergen("Soy", productWithIngredients(beanCurd)).matchedText, "bean curd");
  assert.equal(classify("Milk", "water kefir (filtered water, organic cane sugar, kefir grains)"), "contains", "the second kefir isn't after water, so it fires — principle 1");
  assert.equal(classify("Milk", "organic water kefir, organic ginger juice"), "clear");
  assert.equal(matchAllergen("Milk", productWithIngredients("Water, Kefir Cultures, Sugar")).matchedText, "Kefir");
  // The guard skips one use at a time: a label with bean curd and cheese curd warns.
  assert.equal(matchAllergen("Milk", productWithIngredients("bean curd, curd, salt")).matchedText, "curd");
});

test("malt is barley, maltodextrin and maltose aren't", () => {
  assert.equal(classify("Gluten", "Malt, hop and yeast"), "contains"); // 8847100740199, a beer
  assert.equal(matchAllergen("Barley", productWithIngredients("Malt, hop and yeast")).matchedText, "Malt");
  assert.equal(classify("Gluten", "TOMATO PUREE (WATER, TOMATO PASTE), HIGH FRUCTOSE CORN SYRUP, MALT VINEGAR, RAISIN CONCENTRATE"), "contains"); // 0011110715364, accepted over-warn
  assert.equal(classify("Gluten", "maltodextrin, salt, onion*, monosodium glutamate, garlic*, parsley*, sugar, spices, carrageenan, calcium stearate,"), "clear"); // 0011110708755
  assert.equal(classify("Gluten", "Non-gmo soybean, maltose, black soybean, sugar"), "clear");
  assert.equal(classify("Wheat", "malted milk"), "clear", "malted is not the keyword either");
});

test("wheat by four more names: farro, einkorn, triticale, graham", () => {
  const real: [string, string][] = [
    ["farro", "Water, farro, extra virgin olive oil, sea salt."], // 0084655402082
    ["einkorn", "Organic whole grain einkorn, water."], // 0815421011104
    ["TRITICALE", "FRESHLY-GROUND WHOLE, ORGANIC TRITICALE FLOUR"], // 0015568109515
    ["GRAHAM", "SUGAR, RICE FLOUR, PALM OIL, WATER, TAPIOCA STARCH, VANILLA, NATURAL GRAHAM FLAVOR"], // 0030684790232, accepted over-warn
  ];
  for (const [word, text] of real) assert.equal(matchAllergen("Wheat", productWithIngredients(text)).matchedText, word, text);
  for (const text of ["farrow", "grahams crackers", "triticales"]) assert.equal(classify("Wheat", text), "clear", text);
});

test("egg by other names: albumen, lysozyme, mayonnaise, meringue", () => {
  const real: [string, string][] = [
    ["ALBUMEN", "SUGAR, ALMONDS 20%, APRICOT KERNEL, ALBUMEN, RICE FLOUR, WHEAT FLOUR"], // 0004835501510, cut before its "EGG YOLK"
    ["lysozyme", "Pasteurized sheep's milk, cheese cultures, salt, animal rennet, eggwhite, lysozyme (preservative), natamycin"], // 0037982786851 ("eggwhite" is one word, so "egg" can't fire)
    ["MAYONNAISE", "MAYONNAISE, MILK, CORN OIL, RICE VINEGAR, SUGAR, SPICES"], // 0034947010006
    ["meringue", "Milk, sugar, lemon juice, glucose syrup, meringue grains (sugar, wheat starch), refined coconut oil"], // 0075450138542, accepted over-warn
  ];
  for (const [word, text] of real) assert.equal(matchAllergen("Egg", productWithIngredients(text)).matchedText, word, text);
  for (const text of ["albumens", "mayonnaises", "meringues", "lysozymes"]) assert.equal(classify("Egg", text), "clear", text);
});

test("soy by other names: miso, tamari, natto, shoyu, yuba, textured vegetable protein", () => {
  const real: [string, string][] = [
    ["MISO", "KALE, CASHEWS, SUNFLOWER SEEDS, ORGANIC MISO PASTE, HABANERO PEPPERS"], // 0011150989688
    ["tamari", "Lima beans, safflower oil, lemon juice, wheat-free tamari, tahini, parsley"], // 0723175787599
    ["natto", "rice powder, bacillus natto, hydrolysed protein, sugar syrup, sugar"], // 0074410940911, with its "natto: soybean" taken out of the way
    ["shoyu", "Filtered water, non-gmo vital wheat gluten, organic red kidney beans, chickpea flour, organic shoyu"], // 0859738005005
    ["yuba", "Hodo organic yuba (water), rice vinegar* (water, rice*)"], // 0853404002701, with "organic soybeans" and the soybean oil taken out of the way
    ["textured vegetable protein", "Pork, water, textured vegetable protein contains 2% or less of the following: salt"], // 0076625520148
  ];
  for (const [word, text] of real) assert.equal(matchAllergen("Soy", productWithIngredients(text)).matchedText, word, text);
  // Tamarind isn't tamari; "textured wheat protein" isn't soy.
  for (const text of ["tamarind, tom. paste, basil", "textured wheat protein (wheat protein, wheat starch)", "misoshiru"]) {
    assert.equal(classify("Soy", text), "clear", text);
  }
});

test("fish by four more names: surimi, pollock, trout, tilapia", () => {
  const real: [string, string][] = [
    ["surimi", "Water, surimi(threadfin bream, and/or japanese shad), soybean paste, soybean oil"], // 0018511513100, with "pollock" taken out of the way (it is matched first)
    ["pollock", "Wild pollock filet, gluten free breading (modified potato starch, tapioca starch)"], // 0749512585116
    ["Trout", "Trout fillets, canola oil, salt, smoke."], // 0080943004648
    ["Tilapia", "Tilapia loin, batter mix (water, wheat flour, yellow corn flour)"], // 0075391048580
  ];
  for (const [word, text] of real) assert.equal(matchAllergen("Fish", productWithIngredients(text)).matchedText, word, text);
  for (const text of ["pollocks", "trouts", "surimis"]) assert.equal(classify("Fish", text), "clear", text);
});

test("crustaceans by plural and species: prawns, shrimps, crawfish, crayfish, krill, scampi, langoustine(s)", () => {
  const real: [string, string][] = [
    ["Prawns", "King Prawns, Garlic Purée, Red Chillies, Tomato Juice, Tomato Paste"], // 00154741
    ["SHRIMPS", "65% SHRIMPS, 35% SALT."], // 0044406070014
    ["CRAWFISH", "WHOLE COOKED CRAWFISH SALT, RED PEPPER"], // 0040902339495
    ["crayfish", "Potatoes, vegetable oil, spicy crayfish flavoring seasoning (contains edible flavoring)"], // 6924743923430
    ["krill", "krill oil, gelatin (porcine), glycerin, water, ethyl vanillin."], // 0096619635290
    ["Scampi", "Smiths Scampi"], // 08116417
    ["langoustines", "Gastronomique & Breton langoustines 55 Creme citron vert"], // 3770003617457
    ["Langoustine", "_Langoustine_ cooked meat juice concentrate 68% (water, maltodextrin, salt)"], // 7613035849266
  ];
  for (const [word, text] of real) assert.equal(matchAllergen("Shellfish", productWithIngredients(text)).matchedText, word, text);
  // "shrimp-flavoured" still matches, by "shrimp": a hyphen is a boundary.
  assert.equal(matchAllergen("Crustaceans", productWithIngredients("shrimp-flavoured crackers")).matchedText, "shrimp");
  for (const text of ["krills", "scampis", "crawfishes"]) assert.equal(classify("Crustaceans", text), "clear", text);
});

test("molluscs by other names: snail, snails, calamari", () => {
  assert.equal(matchAllergen("Molluscs", productWithIngredients("Snail helix iucorum, water")).matchedText, "Snail"); // 3111950425700
  assert.equal(matchAllergen("Molluscs", productWithIngredients("SNAILS WATER, SALT PEPPER, LAUREL CLOVES, CITRIC ACID")).matchedText, "SNAILS"); // 0041224260146
  assert.equal(matchAllergen("Mollusc", productWithIngredients("Wheat Flour, Calamari (13%), Water, Prawn (10%), Cabbage")).matchedText, "Calamari"); // 9313353050822
  for (const text of ["snailery", "calamaris"]) assert.equal(classify("Molluscs", text), "clear", text);
});

test("sesame by other names: gingelly, tahina", () => {
  assert.equal(matchAllergen("Sesame", productWithIngredients("Lime pieces, Salt, Chilli powder, Gingelly oil, Mustard, Fenugreek")).matchedText, "Gingelly"); // 94447750
  assert.equal(matchAllergen("Sesame", productWithIngredients("Tahina (%52), sugar, glucose syrup, cocoa (%2), soapwort extract")).matchedText, "Tahina"); // 0603608573015
  assert.equal(classify("Sesame", "tahinas, gingellys"), "clear");
});

test("tree nuts by other names: marzipan (almond), praline (unspecified), pine nut(s), filbert(s) (hazelnut)", () => {
  assert.equal(matchAllergen("Tree nuts", productWithIngredients("Milk, ricotta cheese, sugar, glucose, cream, marzipan, pasteurized egg yolk")).matchedText, "marzipan"); // 0858000004579
  assert.equal(matchAllergen("Almond", productWithIngredients("cream, marzipan, pasteurized egg yolk")).matchedText, "marzipan");
  assert.equal(matchAllergen("Walnut", productWithIngredients("cream, marzipan, pasteurized egg yolk")).matched, false, "marzipan is almond, not walnut");
  assert.equal(matchAllergen("Tree nuts", productWithIngredients("Milk chocolate praline (cocoa solids: 30% minimum) with yogurt-flavoured mousses filling")).matchedText, "praline"); // 0003535048455
  assert.equal(matchAllergen("Pecan", productWithIngredients("Milk chocolate praline")).matchedText, "praline", "praline doesn't say which nut — principle 1");
  assert.equal(matchAllergen("Peanut", productWithIngredients("Milk chocolate praline")).matched, false);
  assert.equal(matchAllergen("Tree nuts", productWithIngredients("Fresh basil, water, gmo free canola oil, spices, salt, olive oil, pine nut, acidity regulator")).matchedText, "pine nut"); // 0602652140013
  assert.equal(matchAllergen("Tree nuts", productWithIngredients("BASIL, OLIVE OIL, CANOLA OIL, RECONSTITUTED LEMON JUICE, PARSLEY, GARLIC, WALNUTS, SALT, PINE NUTS, SPICE.")).matchedText, "PINE NUTS", "quoted before the walnuts and the nuts inside it"); // 0011110658777
  assert.equal(matchAllergen("Tree nuts", productWithIngredients("Filberts. (treated with sulfur dioxide)")).matchedText, "Filberts"); // 0078264030125
  assert.equal(matchAllergen("Hazelnut", productWithIngredients("Filberts. (treated with sulfur dioxide)")).matchedText, "Filberts");
  assert.equal(matchAllergen("Hazelnut", productWithIngredients("Organic almonds, organic cashews, organic brazil nuts. organic turkish filbert, organic pecans, salt.")).matchedText, "filbert"); // 0077890305454
  assert.equal(matchAllergen("Cashew", productWithIngredients("Filberts.")).matched, false, "filbert is hazelnut, not cashew");
  for (const text of ["pralines", "marzipans", "doughnuts, coconuts, peanuts"]) assert.equal(classify("Tree nuts", text), "clear", text);
});

test("sulphites by E number: E220–E228, either case, never inside a longer code", () => {
  assert.equal(classify("Sulphites", "100% coconut juice with pulp, sodium metabisuphite (E223)."), "contains"); // 0855735005482, the label's own spelling
  assert.equal(matchAllergen("Sulphites", productWithIngredients("100% coconut juice with pulp, sodium metabisuphite (e223).")).matchedText, "e223");
  assert.equal(matchAllergen("Sulfite", productWithIngredients("sodium metabisuphite (E223)")).matchedText, "E223");
  const real: [string, string][] = [
    ["e221", "ginger, sugar, water, preservative (e221),"], // 3379140139121
    ["E222", "exe, a±dfrnt: E330t E222). da coco sucre, sucre"], // 3191220006341, as the label's OCR came through
    ["e224", "young coconut (80%), water, sugar, citric acid (e330) as acidity regulations, potassium metabsulphaite(e224) as preservative"], // 0016229901479
    ["E225", "lait de brebis, sel, présure, ferments lactiques, conservateurs E225 et E202"], // 2481246018765, French: the export's only E225
    ["E226", "Palm Oil, Preservative: E226, Yeast, Vegetable Oil, Salt, Soya Flour"], // 5060650730080
    ["E227", "preservative: E227"], // no label in the export writes E227; kept as a real EU sulphite code (synonyms.ts)
    ["e228", "preservatives (e228, e200), alcohol vinegar, gluten, bean flour"], // 8437011972736
  ];
  for (const [word, text] of real) assert.equal(matchAllergen("Sulphites", productWithIngredients(text)).matchedText, word, text);
  for (const text of ["e2201", "e22", "e229", "e2230", "1e223"]) assert.equal(classify("Sulphites", text), "clear", text);
});

test("the new words are keywords only: no profile allergen's family key moves", () => {
  for (const [name, expected] of [["Butter", "name:butter"], ["Cheese", "name:cheese"], ["Malt", "name:malt"], ["Prawns", "name:prawn"], ["Mayonnaise", "name:mayonnaise"], ["Marzipan", "name:marzipan"], ["Miso", "name:miso"]]) {
    assert.equal(allergenFamilyKey(name), expected);
  }
});

test("the tag spellings add no correction keys: a 'Molluscs' or 'Sesame' profile keeps its family key", () => {
  assert.equal(allergenFamilyKey("Molluscs"), "cluster:mollusc");
  assert.equal(allergenFamilyKey("Sesame seeds"), "name:sesame seed");
  assert.notEqual(allergenFamilyKey("Sulphur dioxide and sulphites"), allergenFamilyKey("Sulphites"));
});
