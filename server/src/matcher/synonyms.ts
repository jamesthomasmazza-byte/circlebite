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
const CRUSTACEAN = ["shellfish", "crustacean", "crustaceans", "shrimp", "prawn", "crab", "crabmeat", "lobster"];
const TREE_NUTS = [
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
  { id: "gluten", aliases: GLUTEN, keywords: GLUTEN },
  { id: "crustacean", aliases: CRUSTACEAN, keywords: CRUSTACEAN },
  // Peanut is deliberately its own cluster, never merged with tree nuts — a real safety error to
  // conflate them, per legacy-spec.md.
  { id: "peanut", aliases: ["peanut", "peanuts", "groundnut", "groundnuts"], keywords: ["peanut", "peanuts", "groundnut", "groundnuts"] },
  // The umbrella: "Tree Nuts" on a profile matches any of them.
  { id: "tree-nut", aliases: ["tree nut", "tree nuts"], keywords: TREE_NUTS },
  // Each nut is also its own narrow entry: "Walnut" on a profile matches only walnut.
  { id: "almond", aliases: ["almond", "almonds"], keywords: ["almond", "almonds"] },
  { id: "hazelnut", aliases: ["hazelnut", "hazelnuts"], keywords: ["hazelnut", "hazelnuts"] },
  { id: "walnut", aliases: ["walnut", "walnuts"], keywords: ["walnut", "walnuts"] },
  { id: "cashew", aliases: ["cashew", "cashews"], keywords: ["cashew", "cashews"] },
  { id: "pecan", aliases: ["pecan", "pecans"], keywords: ["pecan", "pecans"] },
  { id: "pistachio", aliases: ["pistachio", "pistachios"], keywords: ["pistachio", "pistachios"] },
  { id: "brazil-nut", aliases: ["brazil nut", "brazil nuts"], keywords: ["brazil nut", "brazil nuts"] },
  { id: "macadamia", aliases: ["macadamia", "macadamias"], keywords: ["macadamia", "macadamias"] },
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
