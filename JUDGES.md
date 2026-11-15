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
her scans, one compact row each — the product's photo (a placeholder for these invented brands), its
name and brand, and a small pill with its verdict as it is **now**, computed from the stored product
data with no AI call: "Contains: Peanut", "May contain: Sesame", "No listed allergens", "Unable to
confirm". One screening note sits under the title for the whole list. Tap a row for the item's own
page: the full verdict with every allergen that was checked, the note, "Scan it when it arrives —
stores can send a different version. Screening aid, not a guarantee.", and the actions. The peanut
bar reads **Contains: Peanut** (its note, "Approved before Maya's peanut allergy was confirmed": the
verdict is live, so an allergen added later flags an old item): the app never offers to shop for a
Contains item, and its page shows "Label wrong? Report a correction" instead. The crackers and the
biscuits are invented brands with no photo and no Amazon page, so they carry "Shop on Amazon" and
"Shop on Instacart" as plain search links that open in a new tab. **Two real products** are on the
list beside them, **Oreo Chocolate Sandwich Cookies** and **PopCorners Kettle Corn**, with
their product photos from Open Food Facts and a row that says "· On Amazon": their Amazon links were
set once, for every family, by the app's admin, so "Shop on Amazon" goes straight to the product.
Their verdicts are computed for Maya like any other item's; nothing about them is staged. As Maya's
owner you can add a note or remove an item from its page; on Noor, whom you follow, you can only
read. To add one, search for it on the tab (below), or scan it for Maya and tap "Add to Maya's snacks"
under its card.

If the Snacks tab also has a **search box**, type a name or brand: results come first from products
this app has already seen; with none, Open Food Facts is asked at once, and "Search more" asks it when
there were local results. As Maya's owner each result has an **Add** button: it runs the same check a
scan would for Maya, adds a clean product to the list, and asks first — naming the allergen — when the
product reads "Contains an allergen" or "May contain". Tapping the result's name instead opens its
full card on Scan. Nothing goes on the list by itself. If Open Food Facts is slow or busy the page says
it couldn't reach it; try once more.

If the Oreo and PopCorners rows have a **checkbox** on the right, the Amazon cart is on. Tick them both:
the bar above the tabs reads "Add 2 to Amazon cart" within a second and is itself the link — one tap
opens Amazon in a new tab with both in its add-to-cart step (sign in there to finish; nothing is
bought by the app). It is a disabled button only for the moment the link is being built. The app
builds that link on its own server and checks each item's verdict again first: a "Contains an
allergen" item is never put in a cart (the peanut bar reads "Not for cart" instead of a checkbox), and
an item without an Amazon link is named as left out. The invented items have no checkbox because they
have no Amazon page; as Maya's owner you can give any item one with "Link on Amazon" on its page,
which opens the Amazon search in a new tab and a box for the product's amazon.com address, of which
only the product code is kept. The list shows a one-line note that Amazon links may earn CircleBite a
commission; that never changes a verdict or the order of the list.

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
