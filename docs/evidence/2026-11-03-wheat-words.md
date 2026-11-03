# Wheat in one word, and emmer: real-product evidence (2026-11-03)

`\bwheat\b` can't match inside a one-word compound, so a Wheat profile missed products whose label
says "wheat" only inside another word. This adds five keywords to `WHEAT_BY_OTHER_NAMES`:
`wholewheat`, `wheatflour`, `wholemeal`, `emmer`, and `bulgar` (a real label's spelling of bulgur).
Approved by JT after review, 2026-11-03.

## Method

- **Sample:** the 1,808 Open Food Facts products in `2026-11-03-underscore-allergens.md`. It includes
  full-text searches for "wholewheat", "wholemeal" and "wheatflour".
- **Words checked:** every word in the ingredient text that contains "wheat" or "meal" was counted,
  so the keywords come from what labels actually say. Found: wholemeal 120, wholewheat 51,
  wheatflour 20, buckwheat 6, wheatgerm 4, wheatflakes 3, wheatgrass 1, cornmeal 1.
- **Baseline:** the matcher with the underscore fix (`cf05bf9`), on ingredient text alone, against
  the same matcher with the five words added.

## Result: 9 products fixed, no new false cautions

| Barcode | Product | Text | Wheat/gluten tag |
|---|---|---|---|
| 29329724 | Wholewheat Giant Couscous | `Wholewheat couscous.` | **none** |
| 5000169293201 | wholewheat bulgar | `wholewheat bulgar` | **none** |
| 8809020307500 | Wholewheat crackers | `milk, wholewheat flour, …` | **none** |
| 5010142008692 | Plain Flour | `Wheatflour` | yes |
| 00322775 | Wholewheat Medium Noodles | `Wholewheat Flour (89%), Water, Salt.` | yes |
| 5059319013473 | Blueberry Wheats | `Wholewheat (72%), …` | yes |
| 5059319002781 | Frosted Wheats | `Shredded wholewheat(83%), …` | yes |
| 5060430290964 | Moroccan Beets & Sweet Potato Salad | `Wholewheat Couscous (26%), …` | yes |
| 29436156 | Oat Crunch | `Wholemeal Wheatflour` | yes |

Every new hit is wheat.

## Words left in on principle, with no new catch in this sample

- **wholemeal:** unqualified wholemeal flour is wheat. Every wholemeal product in the sample also says
  "wheat" somewhere else.
  - What follows "wholemeal" across the sample: wheat 131, flour 13, spelt 5, rye 5, emmer 2, rice 1.
  - **Known false caution:** `wholemeal rice flour`, a gluten-free bread (`9310023144034`). That
    product is already flagged today because its text says "Gluten Free". Accepted under
    principle 1, like semolina.
- **emmer:** a wheat species, as in `Wholemeal Emmer Wheat Flour` (`5060149576069`). Both products
  that name it also say "wheat".

## Still missed, and left alone

- **wheatgerm, wheatflakes, wheatgrass:** each appeared only on products the matcher already
  catches.
- **buckwheat:** stays a miss, as before. It is not wheat.
