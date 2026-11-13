# CircleBite — a guide for judges

## Start here: click your judge link

Prof. Yoest sends one link for every judge. Click it: CircleBite opens already signed in to a demo
judge account, on Maya's result for `2990000000083`. There is nothing to type and no password.

Each judge's demo family is kept apart in the data, so a report you file never counts toward
another judge's, or toward a real family's. Everyone, products and report in the demo is invented.

## Your circle

You hold one role on each of three children's profiles:

| Profile | Your role | Allergens on file |
|---|---|---|
| **Maya** | owner | Peanut (severe), Sesame (moderate) |
| **Leo** | co-manager | Milk (severe), Egg (mild) |
| **Noor** | follower | Tree nut (severe), Wheat (moderate) |

## Optional: see the scan yourself

Scanning is the heart of the app. A printed card with the shared barcode, to scan off paper or a
laptop screen, is `docs/judges/judge-card.html`.

Choose the profile on the scan page **before** you enter a barcode. Don't rely on the one already
selected: it can differ between accounts and after a reset. The same barcode gives a
different result for each child, which is the point.

| Barcode | Profile | What the card shows |
|---|---|---|
| `2990000000021` | **Maya** | **Contains an allergen**: Peanut, contains, listed on the product record. The everyday catch. |
| `2990000000069` | **Noor** | **Contains an allergen**: Tree nut, contains, listed on the product record. You follow Noor, so you can scan for her but can't remove a warning. On Maya or Leo this same barcode correctly shows **No listed allergens found**. |
| `2990000000076` | **Maya** | **Contains an allergen**, even though no product database knows this barcode. The card says once that there is no product data ("We don't have this barcode on file…"). Peanut is "reported by 2 shoppers with a label photo — not in the product data", sesame is named as not checked, and below them: "The product data alone says **Unable to confirm**". Two separate families, neither in your circle, each reported peanut with a photo. A warning reaches other families only once two have reported it. |
| `2990000000083` | **Maya**, then **Noor** | **Contains an allergen** on both, from one report each by someone in that child's circle, not yet confirmed by a second family. Every judge scans this same barcode and sees only their own circle's reports: a report filed from a judge's account, or anyone in their circle, counts only toward that judge's own. On Maya, whose owner you are, the card names who filed it: "Priya Nair (co-manager) reported Sesame present and photographed the label. No other family has confirmed it yet." On Noor, whom you follow, it gives the role only: "A co-manager in Noor's circle reported Wheat present and photographed the label. No other family has confirmed it yet." The owner and co-managers see who reported; a follower sees only their role. |

On Leo or Noor, `2990000000076` gets no warning: the families reported peanut, and neither child
is allergic to it.

## Snacks (if the tab is there)

If the tab bar shows a fourth tab, **Snacks**, Maya's list is on it: three products approved from
her scans, each with its verdict as it is **now** — computed from the stored product data, no AI
call — in the same words as a scan card. "Approved by" names who added it. One item reads **Contains
an allergen** (the peanut bar): the app never offers to shop for a Contains item, and shows "Label
wrong? Report a correction" instead. The other two carry "Shop on Amazon" and "Shop on Instacart",
plain search links that open in a new tab, under "Scan it when it arrives — stores can send a
different version." As Maya's owner you can add a note or remove an item; on Noor, whom you follow,
you can only read. To add one, scan a product for Maya and tap "Add to Maya's snacks" under its card.

If there is no Snacks tab, the feature stayed switched off for judging and nothing above applies.

## Reporting a correction

Please file reports only against the demo barcodes above (every one starts `2990000000`). A report
on a real product becomes a live warning for real families until it is cleared.

## Why one person can't clear a warning

One real case from testing, not part of the demo. Two test accounts, both belonging to the
developer, reported sesame in a real Icelandic butter spread. Its ingredients have no sesame. The
app counted the two accounts as two families, so the warning was confirmed for everyone. It was
removed by hand on November 3 (`docs/journal.md`, 2026-11-03).

It also shows the safeguard working as designed: two accounts from one person could only add a
warning, never clear one. A report that an allergen isn't there is noted on the reporter's own card
and never applied, so the same trick can't remove a real warning (`docs/fake-family-risk.md`).
