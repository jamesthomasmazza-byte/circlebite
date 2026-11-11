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
// Milk named without the word (2026-11-10): the full Open Food Facts audit
// (docs/evidence/2026-11-10-off-full-audit.md) found these on real labels that read clear for milk.
// Keywords only, never aliases — DAIRY is the alias list, and an alias would move a profile's
// correction key. Each from a product's own ingredient text:
//   "PASTEURIZED MIL, CHEESE CULTURES, SALT, ENZYMES" (0021130043965, "milk" misspelled on the label)
//   "Fat Free Greek Style Yogurt (MK) (87%) - Honey (5%)" (00374613)
//   "yoghurt cultures" (23062733)
//   "Cheddar cheese curds Cheese culture, salt" (0025611620768; "pasteurized milk, salt, cheese curds (microbial)", 5711953084690)
//   "curd" alone: "dried bean curd (soybeans, water, salt, calcium chloride)" (0011152000671)
//   "rawk star creations kefir culture, organic evaporated cane juice" (0704550279151)
//   "Vegetable Ghee (Palm Oil, Rapeseed Oil)" (01674361)
//   "Soya Paneer (Soya beans, Water, Citric Acid, Salt)" (8901552021371)
//   "salted butter (13%) (butterfat, water, salt)" (0010318002757)
// "butter" and "cream" are here too, but they are guarded in match.ts (GUARDED_KEYWORDS): "peanut
// butter" and "cocoa butter" aren't milk, nor are "coconut cream" and "cream of tartar"; "butter
// (cream, salt)" (0009542017194) and "Grade a cream, sea salt." (0041231000131) are. So are "kefir"
// (not "water kefir") and "curd" (not "bean curd", which is tofu and a soy keyword below).
// Known over-warns, accepted under principle 1: soya paneer (tofu), "vegetable ghee", dairy-free
// cheese and yogurt, "kefir culture" in sodas.
const MILK_BY_OTHER_NAMES = ["butter", "cream", "cheese", "yogurt", "yoghurt", "curd", "curds", "kefir", "ghee", "paneer", "butterfat"];
const GLUTEN = ["wheat", "gluten", "barley", "rye"];
// Barley named without the word (2026-11-10): malt is barley malt unless the label says otherwise
// ("Malt, hop and yeast", 8847100740199; "MALT VINEGAR", 0011110715364, an over-warn accepted under
// principle 1). The word match can't fire inside "maltodextrin" or "maltose", which aren't barley;
// match.test.ts proves it. 1,460 products in the audit named malt and read clear for gluten.
const GLUTEN_BY_OTHER_NAMES = ["malt"];
// Wheat named without the word "wheat" (2026-10-30): durum, spelt and bulgur are wheat (durum and
// spelt are wheat species, bulgur is cracked wheat), seitan is wheat gluten, and semolina unqualified
// is durum wheat. Real labels name them alone: "spelt flour, water, yeast, salt" (8718906169890),
// "Water, spelt, green lentils" (0099482455118), "Midyat bulgur" (8691440710172), all with no
// allergen tags, so they were silent misses. Semolina can be made from rice or maize ("rice
// semolina"), so it can over-warn; accepted, principle 1. Not farina, which is Italian for any
// flour ("Farina di lenticchie rosse", 8019730069524), or couscous ("Corn Couscous", 5017601041009).
// Keywords only, never aliases: an alias would move a "Spelt" profile allergen's correction key.
// One-word wheat (2026-11-03): "wholewheat" and "wheatflour" hide "wheat" from the word match
// ("Wholewheat couscous.", 29329724; "Wheatflour", 5010142008692). Wholemeal flour unqualified is
// wheat; "wholemeal rice flour" (9310023144034) is the one non-wheat use found, so it can over-warn,
// accepted like semolina. Emmer is a wheat species ("Wholemeal Emmer Wheat Flour", 5060149576069),
// and "bulgar" is a real label's spelling of bulgur ("wholewheat bulgar", 5000169293201).
// docs/evidence/2026-11-03-wheat-words.md.
// Four more from the full audit (2026-11-10): farro and einkorn are wheat species ("Water, farro,
// extra virgin olive oil, sea salt.", 0084655402082; "Organic whole grain einkorn, water.",
// 0815421011104), triticale is a wheat–rye cross ("FRESHLY-GROUND WHOLE, ORGANIC TRITICALE FLOUR",
// 0015568109515), and graham is wholewheat flour ("NATURAL GRAHAM FLAVOR", 0030684790232 — a flavour,
// so an over-warn there, accepted). Not kamut: one product in the audit, and it says "Khorasan wheat".
const WHEAT_BY_OTHER_NAMES = ["durum", "spelt", "bulgur", "bulgar", "seitan", "semolina", "emmer", "wholewheat", "wheatflour", "wholemeal", "farro", "einkorn", "triticale", "graham"];
const CRUSTACEAN = ["shellfish", "crustacean", "crustaceans", "shrimp", "prawn", "crab", "crabmeat", "lobster"];
// Crustaceans by plural and species (2026-11-10): the full audit found labels that use only these.
// Keywords only — CRUSTACEAN is the alias list. "King Prawns, Garlic Purée" (00154741); "65% SHRIMPS,
// 35% SALT." (0044406070014); "WHOLE COOKED CRAWFISH SALT, RED PEPPER" (0040902339495); "spicy
// crayfish flavoring seasoning" (6924743923430); "krill oil, gelatin (porcine), glycerin"
// (0096619635290); "Smiths Scampi" (08116417); "Breton langoustines" (3770003617457); "_Langoustine_
// cooked meat juice concentrate 68%" (7613035849266).
const CRUSTACEAN_BY_OTHER_NAMES = ["prawns", "shrimps", "crawfish", "crayfish", "krill", "scampi", "langoustine", "langoustines"];
// "nuts" is Open Food Facts' own tag for tree nuts ("en:nuts", normalized by openFoodFacts.ts), so
// a record tagged only that way was a silent miss for a correctly spelled "Tree nuts" profile — found
// on barcode 096619160761 (production, 2026-10-16), tagged "nuts" in both allergens and traces. As an
// ingredient-text keyword it only matches the word "nuts" on its own: \bnuts\b can't fire inside
// "peanuts", "doughnuts" or "coconuts". Keyword only, never an alias — a profile allergen named
// "Nuts" doesn't say which nuts, and could mean peanuts.
// Praline (2026-11-10) is a nut paste or a filled chocolate, and the label doesn't say which nut:
// "Milk chocolate praline (cocoa solids: 30% minimum)" (0003535048455), which may hold no nut at
// all — an over-warn accepted under principle 1. Unspecified, so it reaches every single-nut cluster
// like "nuts" does.
const UNSPECIFIED_NUTS = ["nuts", "praline"];
// Nuts by other names (2026-11-10, full audit): marzipan is almond ("cream, marzipan, pasteurized
// egg yolk", 0858000004579), filbert is hazelnut ("Filberts. (treated with sulfur dioxide)",
// 0078264030125; "organic turkish filbert, organic pecans, salt.", 0077890305454), and pine nuts have no
// cluster of their own ("olive oil, pine nut, acidity regulator", 0602652140013; "WALNUTS, SALT, PINE
// NUTS, SPICE.", 0011110658777). Keywords only.
const ALMOND_BY_OTHER_NAMES = ["marzipan"];
const HAZELNUT_BY_OTHER_NAMES = ["filbert", "filberts"];
// The specific names come before UNSPECIFIED_NUTS so a card quotes "pine nuts", not the "nuts" inside it.
const TREE_NUTS = [
  ...ALMOND_BY_OTHER_NAMES,
  ...HAZELNUT_BY_OTHER_NAMES,
  "pine nut",
  "pine nuts",
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
// Four more species and surimi (2026-11-10, full audit), each from a label that read clear for fish:
// "Wild pollock filet, gluten free breading" (0749512585116); "Trout fillets, canola oil, salt,
// smoke." (0080943004648); "Tilapia loin, batter mix" (0075391048580); surimi is fish paste —
// "Water, surimi(threadfin bream, pollock, and/or japanese shad)" (0018511513100). Not bass: of the
// audit's 26 "bass" rows, 7 were sea bass and the rest OCR noise, a brand ("bassé") and "bass.com".
const FISH_SPECIES = ["fish", "cod", "salmon", "tuna", "anchovy", "anchovies", "sardine", "sardines", "haddock", "pollock", "trout", "tilapia", "surimi"];
// Open Food Facts' own allergen tags, as openFoodFacts.ts normalizes them (2026-11-03): tags match
// keywords by exact equality, so "en:sesame-seeds", "en:sulphur-dioxide-and-sulphites" and
// "en:molluscs" matched nothing, and a product tagged only that way read as clear. 131 of 1,810
// real products did (docs/evidence/2026-11-03-tag-gap.md). In ingredient text they add little: the
// first two contain a keyword already, and "molluscs" is mostly an allergen statement. Keywords
// only, never aliases, so no correction key moves. Same call as "nuts" above.
const OFF_TAG_SESAME = "sesame seeds";
const OFF_TAG_SULPHITES = "sulphur dioxide and sulphites";
// Snails and calamari (2026-11-10, full audit): "Snail helix iucorum, water" (3111950425700); "SNAILS
// WATER, SALT PEPPER, LAUREL CLOVES" (0041224260146); "Wheat Flour, Calamari (13%), Water, Prawn (10%)"
// (9313353050822). Not escargot, abalone, whelk or cockles: one or two rows each in the audit.
const MOLLUSCS = ["mollusc", "molluscs", "oyster", "oysters", "mussel", "mussels", "clam", "clams", "scallop", "scallops", "squid", "octopus", "snail", "snails", "calamari"];

export const SYNONYM_CLUSTERS: SynonymCluster[] = [
  { id: "dairy", aliases: DAIRY, keywords: [...DAIRY, ...MILK_BY_OTHER_NAMES] },
  { id: "gluten", aliases: GLUTEN, keywords: [...GLUTEN, ...WHEAT_BY_OTHER_NAMES, ...GLUTEN_BY_OTHER_NAMES] },
  { id: "crustacean", aliases: CRUSTACEAN, keywords: [...CRUSTACEAN, ...CRUSTACEAN_BY_OTHER_NAMES] },
  // Peanut is deliberately its own cluster, never merged with tree nuts — a real safety error to
  // conflate them, per legacy-spec.md.
  { id: "peanut", aliases: ["peanut", "peanuts", "groundnut", "groundnuts"], keywords: ["peanut", "peanuts", "groundnut", "groundnuts"] },
  // The umbrella: "Tree Nuts" on a profile matches any of them.
  { id: "tree-nut", aliases: ["tree nut", "tree nuts"], keywords: TREE_NUTS },
  // Each nut is also its own narrow entry: "Walnut" on a profile matches walnut, never cashew — but
  // it does match "nuts" (UNSPECIFIED_NUTS), which doesn't say which nut. Same call as
  // allergensOverlap's "Tree nuts" report reaching a "Walnut" profile: principle 1, false caution
  // beats false safety.
  { id: "almond", aliases: ["almond", "almonds"], keywords: ["almond", "almonds", ...ALMOND_BY_OTHER_NAMES, ...UNSPECIFIED_NUTS] },
  { id: "hazelnut", aliases: ["hazelnut", "hazelnuts"], keywords: ["hazelnut", "hazelnuts", ...HAZELNUT_BY_OTHER_NAMES, ...UNSPECIFIED_NUTS] },
  { id: "walnut", aliases: ["walnut", "walnuts"], keywords: ["walnut", "walnuts", ...UNSPECIFIED_NUTS] },
  { id: "cashew", aliases: ["cashew", "cashews"], keywords: ["cashew", "cashews", ...UNSPECIFIED_NUTS] },
  { id: "pecan", aliases: ["pecan", "pecans"], keywords: ["pecan", "pecans", ...UNSPECIFIED_NUTS] },
  { id: "pistachio", aliases: ["pistachio", "pistachios"], keywords: ["pistachio", "pistachios", ...UNSPECIFIED_NUTS] },
  { id: "brazil-nut", aliases: ["brazil nut", "brazil nuts"], keywords: ["brazil nut", "brazil nuts", ...UNSPECIFIED_NUTS] },
  { id: "macadamia", aliases: ["macadamia", "macadamias"], keywords: ["macadamia", "macadamias", ...UNSPECIFIED_NUTS] },
  // Egg by other names (2026-11-10, full audit): albumen is egg white spelled with an e ("albumen
  // powder", 5900352000770), lysozyme is made from egg white ("eggwhite, lysozyme (preservative)",
  // 0037982786851 — isolated in match.test.ts so it is the word itself that fires), and mayonnaise
  // and meringue are egg unless the label says vegan ("MAYONNAISE, MILK, CORN OIL", 0034947010006;
  // "meringue grains (sugar, wheat starch)", 0075450138542, an over-warn accepted under principle 1).
  { id: "egg", aliases: ["egg", "eggs"], keywords: ["egg", "eggs", "eggnog", "albumin", "ovalbumin", "albumen", "lysozyme", "mayonnaise", "meringue"] },
  // Soy by other names (2026-11-10, full audit), each from a label that read clear for soy: "ORGANIC
  // MISO PASTE" (0011150989688); "wheat-free tamari" (0723175787599); "natto: soybean, rice powder,
  // bacillus natto" (0074410940911); "organic shoyu" (0859738005005); yuba is tofu skin ("Hodo organic
  // yuba (water, organic soybeans)", 0853404002701; it also over-warns on "yuba city, ca" in a packer's
  // address, 00871240, accepted); "Pork, water, textured vegetable protein" (0076625520148).
  // "bean curd" is tofu ("dried bean curd (soybeans, water, salt, calcium chloride)", 0011152000671),
  // added so a label that says only that still warns for soy once "curd" stops counting as milk there.
  // Not soja, which is other languages leaking through the audit's English heuristic, and not tvp.
  { id: "soy", aliases: ["soy", "soya"], keywords: ["soy", "soya", "soybean", "soybeans", "soymilk", "edamame", "tofu", "bean curd", "miso", "tamari", "natto", "shoyu", "yuba", "textured vegetable protein"] },
  // "fish" itself is included as a keyword too, not just an alias: unlike most allergens, a
  // product almost never contains the literal word "fish" in its ingredient text (labels name
  // the species), so a profile allergen literally named "Fish" needs this cluster to reach the
  // named species — the literal-fallback rule alone wouldn't get there.
  { id: "fish", aliases: ["fish"], keywords: FISH_SPECIES },
  { id: "mollusc", aliases: ["molluscs", "mollusks", "mollusc", "mollusk"], keywords: MOLLUSCS },
  // Gingelly is sesame oil's Indian name ("Chilli powder, Gingelly oil, Mustard", 94447750) and tahina a
  // spelling of tahini ("Tahina (%52), sugar, glucose syrup", 0603608573015). 2026-11-10, full audit.
  // Not til (Hindi, and an abbreviation) or benne (2 rows).
  { id: "sesame", aliases: ["sesame"], keywords: ["sesame", "tahini", "tahina", "gingelly", OFF_TAG_SESAME] },
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
      // The E numbers (2026-11-10, full audit): E220 is sulphur dioxide and E221–E228 the sulphites;
      // labels write them with the compound misspelled or left out, so the code is the only clue —
      // "sodium metabisuphite (e223)" (0855735005482), "potassium metabsulphaite(e224)" (0016229901479),
      // "preservative (e221)" (3379140139121), "E330t E222" (3191220006341), "preservatives (e228,
      // e200)" (8437011972736), "Preservative: E226, Yeast" (5060650730080), "conservateurs E225 et E202"
      // (2481246018765, a French label — the only E225 in the export). E227 (calcium hydrogen sulphite)
      // is on no label in the export, in any language; it is kept at JT's call because it is a real EU
      // code for a sulphite and can't fire on anything else. The regex is case-insensitive, so "E223" on a label matches the lowercase keyword, and bounded by
      // letters and digits, so "e2201" doesn't. 371 products in the audit read clear on these alone.
      "e220",
      "e221",
      "e222",
      "e223",
      "e224",
      "e225",
      "e226",
      "e227",
      "e228",
      OFF_TAG_SULPHITES,
    ],
  },
];
