# CircleBite matcher vs the full Open Food Facts export (2026-11-10)

Read-only audit. Nothing in the repo was changed. Script: `2026-11-10-off-full-audit.ts` (next to this file; copied from the audit's `audit.ts` with its matcher import made relative). What was done about it: `2026-11-10-matcher-before-after.md`. Data: en.openfoodfacts.org.products.csv.gz, OFF nightly CSV export, downloaded 2026-11-10 (ODbL).

## Scope
- 4,904,675 products in the export; 605,512 with English ingredient text (heuristic: common English words, since the CSV has no language column). Only those were checked.
- The matcher is the live code: server/src/matcher/match.ts + synonyms.ts at commit ab949a3.

## Check 1 — OFF tags an allergen; does CircleBite warn? (the barcode path)
735,709 product–allergen pairs where OFF tags one of the 14 major allergens.
**0 pairs read "No listed allergens found."** Every one warns. (The Nov 3 tag fixes hold across the whole database.)

## Check 1b — same pairs, ingredient text only (the label-photo path, and OFF products with no tags)
Text alone catches 92.2% overall. Per allergen: milk 90.6%, gluten 92.0%, soy 96.2%, egg 92.9%, tree nuts 93.4%, peanut 95.3%, mustard 83.6%, celery 90.8%, sesame 91.3%, fish 79.6%, sulphites 88.8%, crustaceans 86.1%, molluscs 84.9%, lupin 77.0%.
The misses are mostly products whose text names the allergen only by another word (below). Some are OFF tags with no basis in the text (tag noise), which no text matcher can catch.

## Check 2 — hidden names in the text, CircleBite clear (full product, tags included)
10,698 hits across the hidden-name list. After reading samples, these look like real gaps, in order of size:

| Allergen | Words the matcher doesn't know | Products reading clear |
|---|---|---|
| milk | **butter** (not peanut/cocoa/almond/shea/apple butter), **cream** (not coconut cream / cream of tartar), cheese, yogurt/yoghurt, curd, kefir, ghee, paneer, butterfat | butter ≈2,200; cream ≈2,950 (mixed, needs the exclusions); cheese 489; yogurt 274; curd 95; kefir 76; ghee 57 |
| sulphites | E220–E228 codes (E223 and E224 most) | 371 |
| gluten | malt (barley malt / malt extract), graham, farro, einkorn, triticale | malt 1,460 (most are "malt extract" in crisped rice etc.); others ~110 |
| egg | albumen (spelt with an e), lysozyme, mayonnaise, meringue | 224 |
| soy | miso, tamari, natto, shoyu, yuba, textured vegetable protein, soja | ~160 (+708 "soja", partly non-English rows) |
| fish | surimi, pollock, trout, tilapia, bass | ~230 |
| crustaceans | plurals and species: prawns, shrimps, crawfish, krill, scampi, langoustine | ~110 |
| molluscs | snail(s), calamari | 25 |
| sesame | gingelly, tahina | 18 |
| tree nuts | marzipan, praline, pine nut(s), filbert(s) | ~50 |

Noise in the hidden-name list, not gaps: "worcestershire" (1,387; fish not always declared), "chestnut(s)" (778; water chestnuts), "til" (453; Hindi/abbreviation), "pesto" (349; nut content varies), "moutarde"/"senf" (other languages leaking through the English heuristic), "nougat" (often nut-free), "couscous"/"farina" (excluded on purpose, see synonyms.ts).

## Notes
- Every candidate fix is a keyword addition in synonyms.ts: it can only add warnings, never clear one (principle 1). "butter" and "cream" need exclusions or they over-warn on peanut butter / cocoa butter / coconut cream.
- Files kept outside the repository (the audit's working directory): summary.json, gaps-hidden-name-but-clear.tsv (10,698 rows), text-only-misses.tsv (first 20,000 tagged-but-text-clear rows), butter-clear.tsv (2,207), gaps-tagged-but-clear.tsv (empty).
