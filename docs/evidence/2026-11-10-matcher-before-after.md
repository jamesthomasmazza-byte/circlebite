# The hidden-allergen words: before and after, over the full Open Food Facts export (2026-11-10)

The full-export audit of the morning (`2026-11-10-off-full-audit.md`) found that the barcode path had
no gap — of 735,709 product–allergen pairs Open Food Facts tags, 0 read clear — but that ingredient
text alone caught 92.2%, and that most of the misses were words the keyword lists didn't have.
This change adds those words (`server/src/matcher/synonyms.ts`), with "butter" and "cream" guarded so
peanut butter, cocoa butter, coconut cream and cream of tartar stay clear (`match.ts`,
`GUARDED_KEYWORDS`). This file measures the change over the same export.

## Method

- **Before:** the matcher at `ab949a3`, the commit before this change.
- **After:** today's matcher.
- **Products:** every product in the export whose ingredient text contains a common English word
  (the, and, of, with, from, contains, flour, sugar, salt, water, oil): 605,511 of 4,904,690. The
  export has no language column, so this is the audit's heuristic, kept so the numbers line up.
- **Profiles:** for every product, one profile per synonym cluster, holding that one allergen
  (named by the cluster's first alias), traces not treated as unsafe, the default. Tags from the
  `allergens_en` and `traces_en` columns, normalized as `openFoodFacts.ts` does.
- **Counted, in one pass:** every pair that read "No listed allergens found" before and warns
  after, with the word that fired; every pair that warned before and reads clear after; every pair
  that was Contains before and May contain after.
- **Script:** `2026-11-10-matcher-before-after.ts` (how to run it is at its top; about 20 minutes).
- **Rows:** `2026-11-10-matcher-before-after.tsv`, the first 2,000 of the new-warning rows by
  barcode, each with the first 120 characters of its ingredient text so the over-warns can be read.

## Result

| | |
|---|---|
| **Product–allergen pairs that read clear and now warn** | **6,633** |
| … now **Contains** | 6,619 |
| … now **May contain** | 14 |
| Distinct products among them | 6,255 |
| **Pairs that warned before and read clear now** | **0** |
| **Pairs that moved Contains → May contain** | **0** |

By allergen: milk 3,655 · gluten 1,588 · sulphites 381 · egg 234 · soy 163 · fish 71 · crustaceans 67 · tree nuts 65 · molluscs 27 · sesame 18, and each single-nut cluster 41–54 (almost all "praline", which doesn't say which nut, so it reaches every one of them).

By word: butter 1,801 · malt 1,481 · cream 888 · cheese 485 · E223 203 · yogurt 181 · mayonnaise 160 · E224 112 · yoghurt 104 · miso 97 · graham 71 · kefir 61 · ghee 59 · curd 56 · praline 33–46 per nut cluster · lysozyme 36 · E221 36 · surimi 34 · prawns 26 · farro 26 · tamari 24 · E222 24 · pollock 21 · albumen 21 · textured vegetable protein 17 · crawfish 16 · meringue 16 · snail 15 · butterfat 14 · krill 12 · trout 12 · marzipan 12 · gingelly 12 · natto 12 · calamari 10 · shoyu 9 · pine nut 6 · tahina 6 · shrimps 6 · paneer 6 · triticale 5 · filberts 5 · scampi 5 · tilapia 4 · einkorn 4 · E228 4 · yuba 4 · snails 2 · langoustines 1 · E226 1 · crayfish 1. Sixteen came from a tag rather than the text: Open Food Facts sometimes
tags a product with a word like "praline" or "butter" instead of the allergen, and those tags now
equal a keyword. None came from "bean curd" as soy: every bean-curd label already says soybeans.
E225 and E227 fired on nothing in this subset (E225's one label is French).

**Nothing went the other way.** The script counts both reversals in the same pass, and both
are 0: no pair that warned reads clear, and none fell from Contains to May contain. This is what
the design guarantees — every change is a keyword addition, and a guard can only narrow where its
own new word fires, never touch another — and the run confirms it over the whole export.

## Two runs: the guard was widened between them

The first run, with the guard as first specified (butter not after peanut, cocoa, almond, cashew,
shea, apple, sunflower, seed, nut; cream not as coconut cream or cream of tartar), gave 7,771
pairs, 0 lost, 0 downgraded. Reading its rows by the word before "butter" showed **cacao butter
400**, **parkii butter 156** (Butyrospermum parkii is shea; Open Food Facts also holds cosmetics),
**coconut butter 50**, **sesame butter 40** and **hazelnut butter 26** warning for milk; and that
60 of 79 kefir rows were water kefir and 36 of 93 curd rows bean curd. JT decided (2026-11-10):
add those five to butter's guard; guard "kefir" against "water" and "curd" against "bean", with
"bean curd" a soy keyword so tofu still warns for soy; keep "kefir culture" warning (ambiguous,
so the cautious side); and keep E227 although no label writes it. The numbers above are the second
run, with all of that in. The difference, 1,138 pairs, is all milk.

## The over-warns, read from the rows

Every one is accepted under principle 1 (false caution beats false safety); they're listed so
nobody is surprised by them. Counts are over all 6,633 rows, by the 120-character slice.

- **Malt vinegar** (gluten): 106 of the 1,481 malt rows. Malt vinegar is made from barley, and
  whether the gluten survives is disputed, so the warning stands.
- **"Natural butter flavor" / "artificial butter flavor"** (milk): 181 rows. Many such flavours do
  carry milk derivatives; the label can't be read closer than this.
- **"Cocoa butter" rows that still warn** (61) have another butter in the text — mostly
  "anhydrous butter oil", which is milk — so they are right, not over-warns.
- **"Vegetable ghee"** (milk): 20 of 59 ghee rows; palm oil sold as ghee.
- **Dairy-free cheese** (about 55 of 485 cheese rows say vegan, dairy-free or plant), **vegan
  mayonnaise** (10 of 160), **"meringue grains (sugar, wheat starch)"**: the word without the
  allergen.
- **"Kefir culture"** in sodas (kept on purpose), **"soya paneer"** (1 of 6 paneer rows — tofu),
  **"natural graham flavor"** (5 of 71).
- **"Yuba City, CA"** in a packer's address (soy): two of the four yuba rows.
- **Praline** in European filled chocolates, which may hold no nut: 33 tree-nut rows, and the
  same products once more per single-nut cluster, since praline doesn't say which nut.
- **Non-food products** Open Food Facts holds: "hand cream", "relief cream" — a few rows.

## Limits

- **The English heuristic is a guess.** A product whose text has none of the ten common words is
  skipped, and some non-English text that happens to contain "oil" or "salt" is included (the
  Dutch "yoghurt culturen" row, for instance). The counts describe this subset.
- **Open Food Facts tags are noisy.** Some products are tagged with an allergen their text never
  names; a text keyword can't catch those, and the audit found 0 of them read clear anyway, since
  the tag is read first. Some tags are wrong (`2026-11-03-matcher-before-after.md` has one).
- **One allergen per profile.** A real card also depends on the profile's other allergens.
- **New warnings are not all right.** 6,633 pairs now warn; the section above lists the kinds that
  shouldn't, counted by word over the rows' 120-character slices. They weren't read one by one.
- **Open Food Facts changes.** A rerun on a fresh export will differ.

## The data

`en.openfoodfacts.org.products.csv.gz`, the nightly CSV export from
`https://static.openfoodfacts.org/data/en.openfoodfacts.org.products.csv.gz`, downloaded
2026-11-10. 4,904,690 rows, about 1.5 GB compressed. The export itself and the audit's raw TSVs
are not in the repository, only the capped rows file.

Open Food Facts data is under the Open Database License (ODbL). The rows file reproduces barcodes,
product names and the start of ingredient lists from it.
