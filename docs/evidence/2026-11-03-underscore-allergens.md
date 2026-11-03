# Allergens marked with underscores: real-product evidence (2026-11-03)

Open Food Facts marks allergens in ingredient text with underscores: `_Wheat_ Flour`,
`(_Sulphites_)`. The matcher's `\bkeyword\b` counts `_` as a letter, so it found no boundary and
missed every marked allergen, whatever the allergen. Shown to JT before the fix, as BACKLOG asked.

## Method

- **Sample:** 1,808 products with ingredient text, from the Open Food Facts search API: the most
  scanned in the United Kingdom and Ireland, the UK categories breads, biscuits, breakfast cereals,
  pastas, cakes and crackers, and full-text searches for "wholewheat", "wholemeal" and "wheatflour".
  190 of them use the `_x_` markup.
- **Today:** the repo's own `matchAllergen`, every synonym cluster as a profile allergen, on the
  ingredient text alone (tags removed).
- **Proposed:** the same keywords, bounded by `(?<![a-z0-9])` and `(?![a-z0-9])`. This is `\b` with `_`
  removed from the word characters. Every keyword starts and ends with a letter or digit.
- **"Today with tags":** the full matcher, tags included, normalized as `openFoodFacts.ts` does.

## Result

| | |
|---|---|
| Misses on text alone that the fix catches (allergen × product) | 156, across 98 products |
| Caught today by the product's tags anyway | 143 |
| **Caught by nothing today** | **13**: sesame ×7, sulphites ×6 |
| Matches that stop matching | 0 |
| New hits not next to an underscore | 0 (150 wrapped `_x_`, 6 inside multi-word markup such as `_Wheat Flour_`) |

**New false cautions: none.** Every one of the 156 new hits is a real allergen word in the
ingredient list. Full list: `2026-11-03-underscore-allergens.tsv`.

**One overstatement:** the matcher doesn't read "may contain" inside ingredient text, for plain text
as well as marked text. Two of the 13 are "may contain" lines and will show **Contains** rather than
**May contain**:
- `5000168001104`: `May also contain _Sesame Seeds_`
- `4088600202433`: `May also contain _nuts_, _peanuts_, _milk_, _sesame_ and _soya_`

Principle 1 accepts this.

## The 13 caught by nothing today

| Barcode | Product | Allergen | Text |
|---|---|---|---|
| 40874302 | Sesame Crispbread | sesame | `12% _Sesame_ Seeds` |
| 5020364010151 | NYC Bagels Sesame | sesame | `_SESAME_ Seeds (4%)` |
| 4088600202433 | Multi-Grain Hoops | sesame | `May also contain … _sesame_` |
| 5060262485309 | Rice noodles chilli miso | sesame | `_sesame_ oil` |
| 5901882110014 | zupka chińska | sesame | `flavourings (_peanuts_, _sesame_)` |
| 5000168001104 | Original Table Water | sesame | `May also contain _Sesame Seeds_` |
| 20086855 | Premium Muesli Luxury Fruit | sulphites | `Preservative: _Sulphur Dioxide_` |
| 5000221001386 | 6 Cherry Bakewells | sulphites | `_Sulphur Dioxide_` |
| 5000221004639 | Kipling Mini Battenbergs | sulphites | `(_métabisulfite_ de sodium (_sulfites_))` |
| 10067819 | Mango | sulphites | `Preservative (_Sulphur Dioxide_)` |
| 20148508 | Vinaigre Balsamique De Modène | sulphites | `Concentrated Grape Must (_Sulphites_)` |
| 5012818160154 | Chopped Garlic | sulphites | `White Wine Vinegar (_Sulphites_)` |
| 5000232844217 | Chickpeas drained | sulphites | `Antioxidant (_Sodium Metabisulphite_)` |

Several of these do carry an Open Food Facts allergen tag, but one the matcher can't read.
`en:sesame-seeds` and `en:sulphur-dioxide-and-sulphites` normalize to "sesame seeds" and
"sulphur dioxide and sulphites", and tags match by exact equality. That is a separate gap: across
the sample, "sesame seeds" appears 177 times and "sulphur dioxide and sulphites" 41 times, with no
keyword equal to either. It was reported to JT on 2026-11-03 and is not fixed here.
