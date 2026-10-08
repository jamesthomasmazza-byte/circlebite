# CircleBite — a guide for judges

Your login arrived by one-time link. Each judge has their own account (`judge1` to
`judge4@demo.circlebite.test`) and their own invented family, so nothing you do shows up for
another judge. Everyone, products and report in this demo is invented.

## Your circle

You hold one role on each of three children's profiles:

| Profile | Your role | Allergens on file |
|---|---|---|
| **Maya** | owner | Peanut (severe), Sesame (moderate) |
| **Leo** | co-manager | Milk (severe), Egg (mild) |
| **Noor** | follower | Tree nut (severe), Wheat (moderate) |

## Barcodes to try

Choose the profile on the scan page **before** you enter a barcode. Don't rely on the one already
selected: it can differ between accounts and after a reset. The same barcode gives a
different result for each child, which is the point.

| Barcode | Profile | What the card shows |
|---|---|---|
| `2990000000021` | **Maya** | **Contains an allergen**: Peanut, contains, listed on the product record. The everyday catch. |
| `2990000000069` | **Noor** | **Contains an allergen**: Tree nut, contains, listed on the product record. You follow Noor, so you can scan for her but can't remove a warning. On Maya or Leo this same barcode correctly shows **No listed allergens found**. |
| `2990000000076` | **Maya** | **Contains an allergen**, even though no product database knows this barcode. Peanut is "reported by 2 shoppers with a label photo — not in the product data". Below it: "The product data alone says **Unable to confirm**", and a note that sesame couldn't be checked because there is no product data on file. Two separate families, neither in your circle, each reported peanut with a photo. A warning reaches other families only once two have reported it. |

On Leo or Noor, `2990000000076` gets no warning: the families reported peanut, and neither child
is allergic to it.

## Reporting a correction

Please file reports only against the demo barcodes above (every one starts `2990000000`). A report
on a real product becomes a live warning for real families until it is cleared.
