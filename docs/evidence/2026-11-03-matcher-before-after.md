# The three matcher fixes together: before and after (2026-11-03)

Three fixes, Oct 30 to Nov 3, each with its own evidence:
- **Wheat by other names** (`7ed5b0a`, Oct 30): durum, spelt, semolina, bulgur, seitan. Checked on
  86 products; that check is in `docs/journal.md`, 2026-10-30.
- **Allergens Open Food Facts marks with underscores** (`cf05bf9`):
  `2026-11-03-underscore-allergens.md`.
- **One-word wheat** (`b2e1eea`): wholewheat, wheatflour, wholemeal, emmer, and the label spelling
  "bulgar". `2026-11-03-wheat-words.md`.
- **Open Food Facts' own sesame, sulphite and mollusc tags** (`5a3decd`): `2026-11-03-tag-gap.md`.

This file measures them together. Each file above measures its fix against the matcher just
before it, and the overlaps make those counts not add up. All four were deployed to production on
November 3 in `553832e` (the 2026-10-30 one earlier, in `688917f`).

## Method

- **Before:** the matcher at `7ed5b0a^`, before the first of the fixes.
- **After:** today's matcher.
- **Profiles:** for every product, one profile per synonym cluster, holding that one allergen
  (named by the cluster's first alias), with traces not treated as unsafe, the default.
- **Counted:** every product that read "No listed allergens found" for that allergen before, and
  warns after.
- **Script:** `2026-11-03-matcher-before-after.ts` (how to run it is at its top).
- **Rows:** `2026-11-03-matcher-before-after.tsv`.

## Result

1,810 products with data:

| | |
|---|---|
| **Distinct products that read clear and now warn** | **140** |
| By allergen | sesame 119, sulphites 15, molluscs 10, wheat 6 |
| Product–allergen pairs | 150 (some products warn for two allergens) |
| … now **Contains** | 43 |
| … now **May contain** | 107 |
| Known false cautions among them | 1 |

**The false caution:** Nutritional Yeast Flakes (`5016084000374`). Open Food Facts tags it
sulphites, but its text says "Zinc sulfate", and sulfate isn't sulphite. It's the tag's mistake,
accepted because the matcher trusts every tag the same way (`2026-11-03-tag-gap.md`).

**Nothing went the other way:** no product–allergen pair that warned before reads clear now, and
none went from Contains to May contain. This was checked with the same script, with its condition
reversed.

## Limits

- **Not a random sample.** It is the most-scanned products in the United Kingdom and Ireland,
  six UK categories (breads, biscuits, breakfast cereals, pastas, cakes, crackers), and full-text
  searches for wholewheat, wholemeal and wheatflour. Those searches raise the wheat count, and the
  UK focus likely raises sesame. The counts describe this sample, not Open Food Facts as a whole.
- **One allergen per profile.** A real card's verdict also depends on the profile's other
  allergens. "Read clear" here means clear for that allergen.
- **Most new warnings are "May contain".** 107 of the 150 pairs came from a traces tag, mostly
  sesame.
- **Open Food Facts changes.** A rerun on a fresh download may differ.

## The sample

Fetched 2026-11-03, 11:30–12:00 ET, as JSON, with
`fields=code,product_name,ingredients_text,allergens_tags,traces_tags` and 100 products a page
(the API's cap). A few pages were refused by rate limiting and are missing. The script skips them.

- **Most scanned, UK:** `https://world.openfoodfacts.org/api/v2/search?countries_tags_en=united-kingdom&sort_by=unique_scans_n&page=N`,
  pages 1–4 and 6–10.
- **Most scanned, Ireland:** the same with `countries_tags_en=ireland`, pages 1–3 and 6.
- **UK categories:** the UK search plus `&categories_tags_en=<category>`:
  - breads and breakfast cereals, pages 1–2;
  - biscuits, page 2;
  - pastas, cakes and crackers, page 1.
- **Full-text:** `https://world.openfoodfacts.org/cgi/search.pl?search_terms=<term>&search_simple=1&json=1&page_size=100&page=N`:
  - wholewheat, pages 1–3;
  - wholemeal, pages 1 and 3;
  - wheatflour, page 1 (its only one).

Open Food Facts data is under the Open Database License. The sample itself isn't in the repository,
only the barcodes and names in the `.tsv`.
