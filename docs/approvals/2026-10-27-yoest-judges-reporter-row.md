# A JUDGES.md row that shows the reporter rule — by the November 13 code freeze

**From:** Prof. Jack Yoest (yoest@cua.edu)
**Date:** October 27, 2026, 2:51 PM ET, as JT received it, in a separate email from his 5:57 AM one
(`2026-10-27-yoest-follower-reporter-name.md`)
**Asks:** by the November 13 code freeze, one row in `JUDGES.md` showing a co-manager's pending
escalation as the owner sees it and as a follower sees it

Only the ask is reproduced here, verbatim, as JT passed it on. The rest of the email isn't saved.
Indexed in `docs/approvals/conditions.md`.

---

> Here is my next ask. Your JUDGES.md has Noor as the follower, but no scenario that shows this rule. By your November 13 code freeze, add one row: a barcode where a co-manager has a pending escalation, and what the owner sees next to what the follower sees. Then a judge can watch the name appear in one seat and the role in the other.

---

## What this binds

1. **By Thursday, November 13, 2026:** one row in `JUDGES.md`'s barcodes table, true after a judge
   reseed, where a judge sees a co-manager's pending escalation by name in one seat and by role only
   in the other.

## How it's met (JT, October 27)

A judge holds only three seats: owner of Maya, co-manager of Leo, follower of Noor. No judge can
sign in as Noor's owner. So the row puts one barcode on two profiles: Maya's co-manager (Priya)
reports Sesame on Maya, where the judge is the owner, and Noor's co-manager (Sam, new to Noor)
reports Wheat on Noor, where the judge follows. Each judge gets their own barcode: four judges'
pending reports of the same allergen on one barcode would be four families, and the threshold
would confirm them (`CORROBORATION_THRESHOLD`, `server/src/corrections/recordCorrection.ts`).
Different allergens on the two profiles, for the same reason.
