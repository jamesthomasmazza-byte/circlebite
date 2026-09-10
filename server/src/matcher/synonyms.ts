/**
 * Synonym clusters from docs/legacy-spec.md §3, hand-transcribed. `aliases` is how a profile's
 * allergen name is matched to a cluster (case-insensitive, exact); `keywords` is what's searched
 * for in the product's tags and ingredient text once a cluster is picked. Most clusters use the
 * same list for both, but the tree-nut umbrella and its individual nuts deliberately don't:
 * "Tree Nuts" as a profile allergen should match any nut, but "Walnut" specifically should not
 * match a product that only contains cashews.
 */
export type SynonymCluster = {
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
  { aliases: DAIRY, keywords: DAIRY },
  { aliases: GLUTEN, keywords: GLUTEN },
  { aliases: CRUSTACEAN, keywords: CRUSTACEAN },
  // Peanut is deliberately its own cluster, never merged with tree nuts — a real safety error to
  // conflate them, per legacy-spec.md.
  { aliases: ["peanut", "peanuts", "groundnut", "groundnuts"], keywords: ["peanut", "peanuts", "groundnut", "groundnuts"] },
  // The umbrella: "Tree Nuts" on a profile matches any of them.
  { aliases: ["tree nut", "tree nuts"], keywords: TREE_NUTS },
  // Each nut is also its own narrow entry: "Walnut" on a profile matches only walnut.
  { aliases: ["almond", "almonds"], keywords: ["almond", "almonds"] },
  { aliases: ["hazelnut", "hazelnuts"], keywords: ["hazelnut", "hazelnuts"] },
  { aliases: ["walnut", "walnuts"], keywords: ["walnut", "walnuts"] },
  { aliases: ["cashew", "cashews"], keywords: ["cashew", "cashews"] },
  { aliases: ["pecan", "pecans"], keywords: ["pecan", "pecans"] },
  { aliases: ["pistachio", "pistachios"], keywords: ["pistachio", "pistachios"] },
  { aliases: ["brazil nut", "brazil nuts"], keywords: ["brazil nut", "brazil nuts"] },
  { aliases: ["macadamia", "macadamias"], keywords: ["macadamia", "macadamias"] },
  { aliases: ["egg", "eggs"], keywords: ["egg", "eggs", "eggnog", "albumin", "ovalbumin"] },
  { aliases: ["soy", "soya"], keywords: ["soy", "soya", "soybean", "soybeans", "soymilk", "edamame", "tofu"] },
  // "fish" itself is included as a keyword too, not just an alias: unlike most allergens, a
  // product almost never contains the literal word "fish" in its ingredient text (labels name
  // the species), so a profile allergen literally named "Fish" needs this cluster to reach the
  // named species — the literal-fallback rule alone wouldn't get there.
  { aliases: ["fish"], keywords: FISH_SPECIES },
  { aliases: ["molluscs", "mollusks", "mollusc", "mollusk"], keywords: MOLLUSCS },
  { aliases: ["sesame"], keywords: ["sesame", "tahini"] },
  { aliases: ["celery", "celeriac"], keywords: ["celery", "celeriac"] },
  { aliases: ["lupin", "lupine"], keywords: ["lupin", "lupine"] },
  {
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
