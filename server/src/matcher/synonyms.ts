/**
 * Synonym clusters from docs/legacy-spec.md §3, hand-transcribed. `aliases` is how a profile's
 * allergen name is matched to a cluster (case-insensitive, exact); `keywords` is what's searched
 * for in the product's tags and ingredient text once a cluster is picked. Most clusters use the
 * same list for both, but the tree-nut umbrella and its individual nuts deliberately don't:
 * "Tree Nuts" as a profile allergen should match any nut, but "Walnut" specifically should not
 * match a product that only contains cashews.
 */
export type SynonymCluster = {
  /** Stable identity, never derived from aliases: correction keys are built from it
   *  (match.ts, allergenFamilyKey) and stored on every report, so reordering or extending
   *  aliases must not change it. Rename one only with a migration that rewrites stored keys. */
  id: string;
  aliases: string[];
  keywords: string[];
};

// The word-boundary regex in match.ts (\bkeyword\b) only matches a keyword that appears as its
// own token — it silently misses any real ingredient word that has the keyword embedded as a
// prefix or suffix of a single compound word, since there's no boundary between two word
// characters. "caseinate"/"caseinates" (sodium/calcium/potassium caseinate — common in non-dairy
// creamers) was found this way: an AI escalation flagged a real product (barcode 0050000328420)
// the deterministic matcher was silently wrong about — see docs/journal.md 2026-09-10. The rest
// below (buttermilk, soymilk, crabmeat, eggnog, bisulfite/metabisulfite) are the same bug class,
// found by auditing the rest of this file afterward and confirmed against real ingredient text
// from real products before adding — not guessed.
const DAIRY = ["milk", "dairy", "lactose", "whey", "casein", "caseinate", "caseinates", "buttermilk"];
const GLUTEN = ["wheat", "gluten", "barley", "rye"];
// Wheat named without the word "wheat" (2026-10-30): durum, spelt and bulgur are wheat (durum and
// spelt are wheat species, bulgur is cracked wheat), seitan is wheat gluten, and semolina unqualified
// is durum wheat. Real labels name them alone: "spelt flour, water, yeast, salt" (8718906169890),
// "Water, spelt, green lentils" (0099482455118), "Midyat bulgur" (8691440710172), all with no
// allergen tags, so they were silent misses. Semolina can be made from rice or maize ("rice
// semolina"), so it can over-warn; accepted, principle 1. Not farina, which is Italian for any
// flour ("Farina di lenticchie rosse", 8019730069524), or couscous ("Corn Couscous", 5017601041009).
// Keywords only, never aliases: an alias would move a "Spelt" profile allergen's correction key.
const WHEAT_BY_OTHER_NAMES = ["durum", "spelt", "bulgur", "seitan", "semolina"];
const CRUSTACEAN = ["shellfish", "crustacean", "crustaceans", "shrimp", "prawn", "crab", "crabmeat", "lobster"];
// "nuts" is Open Food Facts' own tag for tree nuts ("en:nuts", normalized by openFoodFacts.ts), so
// a record tagged only that way was a silent miss for a correctly spelled "Tree nuts" profile — found
// on barcode 096619160761 (production, 2026-10-16), tagged "nuts" in both allergens and traces. As an
// ingredient-text keyword it only matches the word "nuts" on its own: \bnuts\b can't fire inside
// "peanuts", "doughnuts" or "coconuts". Keyword only, never an alias — a profile allergen named
// "Nuts" doesn't say which nuts, and could mean peanuts.
const UNSPECIFIED_NUTS = ["nuts"];
const TREE_NUTS = [
  ...UNSPECIFIED_NUTS,
  "almond",
  "almonds",
  "hazelnut",
  "hazelnuts",
  "walnut",
  "walnuts",
  "cashew",
  "cashews",
  "pecan",
  "pecans",
  "pistachio",
  "pistachios",
  "brazil nut",
  "brazil nuts",
  "macadamia",
  "macadamias",
];
const FISH_SPECIES = ["fish", "cod", "salmon", "tuna", "anchovy", "anchovies", "sardine", "sardines", "haddock"];
const MOLLUSCS = ["oyster", "oysters", "mussel", "mussels", "clam", "clams", "scallop", "scallops", "squid", "octopus"];

export const SYNONYM_CLUSTERS: SynonymCluster[] = [
  { id: "dairy", aliases: DAIRY, keywords: DAIRY },
  { id: "gluten", aliases: GLUTEN, keywords: [...GLUTEN, ...WHEAT_BY_OTHER_NAMES] },
  { id: "crustacean", aliases: CRUSTACEAN, keywords: CRUSTACEAN },
  // Peanut is deliberately its own cluster, never merged with tree nuts — a real safety error to
  // conflate them, per legacy-spec.md.
  { id: "peanut", aliases: ["peanut", "peanuts", "groundnut", "groundnuts"], keywords: ["peanut", "peanuts", "groundnut", "groundnuts"] },
  // The umbrella: "Tree Nuts" on a profile matches any of them.
  { id: "tree-nut", aliases: ["tree nut", "tree nuts"], keywords: TREE_NUTS },
  // Each nut is also its own narrow entry: "Walnut" on a profile matches walnut, never cashew — but
  // it does match "nuts" (UNSPECIFIED_NUTS), which doesn't say which nut. Same call as
  // allergensOverlap's "Tree nuts" report reaching a "Walnut" profile: principle 1, false caution
  // beats false safety.
  { id: "almond", aliases: ["almond", "almonds"], keywords: ["almond", "almonds", ...UNSPECIFIED_NUTS] },
  { id: "hazelnut", aliases: ["hazelnut", "hazelnuts"], keywords: ["hazelnut", "hazelnuts", ...UNSPECIFIED_NUTS] },
  { id: "walnut", aliases: ["walnut", "walnuts"], keywords: ["walnut", "walnuts", ...UNSPECIFIED_NUTS] },
  { id: "cashew", aliases: ["cashew", "cashews"], keywords: ["cashew", "cashews", ...UNSPECIFIED_NUTS] },
  { id: "pecan", aliases: ["pecan", "pecans"], keywords: ["pecan", "pecans", ...UNSPECIFIED_NUTS] },
  { id: "pistachio", aliases: ["pistachio", "pistachios"], keywords: ["pistachio", "pistachios", ...UNSPECIFIED_NUTS] },
  { id: "brazil-nut", aliases: ["brazil nut", "brazil nuts"], keywords: ["brazil nut", "brazil nuts", ...UNSPECIFIED_NUTS] },
  { id: "macadamia", aliases: ["macadamia", "macadamias"], keywords: ["macadamia", "macadamias", ...UNSPECIFIED_NUTS] },
  { id: "egg", aliases: ["egg", "eggs"], keywords: ["egg", "eggs", "eggnog", "albumin", "ovalbumin"] },
  { id: "soy", aliases: ["soy", "soya"], keywords: ["soy", "soya", "soybean", "soybeans", "soymilk", "edamame", "tofu"] },
  // "fish" itself is included as a keyword too, not just an alias: unlike most allergens, a
  // product almost never contains the literal word "fish" in its ingredient text (labels name
  // the species), so a profile allergen literally named "Fish" needs this cluster to reach the
  // named species — the literal-fallback rule alone wouldn't get there.
  { id: "fish", aliases: ["fish"], keywords: FISH_SPECIES },
  { id: "mollusc", aliases: ["molluscs", "mollusks", "mollusc", "mollusk"], keywords: MOLLUSCS },
  { id: "sesame", aliases: ["sesame"], keywords: ["sesame", "tahini"] },
  { id: "celery", aliases: ["celery", "celeriac"], keywords: ["celery", "celeriac"] },
  { id: "lupin", aliases: ["lupin", "lupine"], keywords: ["lupin", "lupine"] },
  {
    id: "sulphite",
    aliases: ["sulphite", "sulphites", "sulfite", "sulfites"],
    // bisulfite/metabisulfite (sodium/potassium bisulfite, sodium/potassium metabisulfite) are
    // extremely common real preservatives that are themselves sulfites — "bisulfite" has "sulfite"
    // embedded with no boundary before it ("...i|sulfite", both word characters), so \bsulfite\b
    // silently missed every one of them. Confirmed against ~15 real products (bare sodium
    // bisulfite in citrus juices) and a real trail mix (sodium metabisulfite) before adding.
    keywords: [
      "sulphite",
      "sulphites",
      "sulfite",
      "sulfites",
      "bisulfite",
      "bisulfites",
      "bisulphite",
      "bisulphites",
      "metabisulfite",
      "metabisulfites",
      "metabisulphite",
      "metabisulphites",
      "sulphur dioxide",
      "sulfur dioxide",
      "e220",
    ],
  },
];
