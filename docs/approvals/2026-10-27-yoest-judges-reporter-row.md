# A JUDGES.md row that shows the reporter rule — by the November 13 code freeze

**From:** Prof. Jack Yoest (yoest@cua.edu)
**Date:** October 27, 2026, 2:51 PM ET, as JT received it
**Subject:** Re: CircleBite: shared escalations, and three corrections
**Answers:** JT's October 27, 11:51 AM reply (`2026-10-27-jt-follower-reporter-name.md`); a separate
email from his 5:57 AM one (`2026-10-27-yoest-follower-reporter-name.md`)
**Asks:** by the November 13 code freeze, one row in `JUDGES.md` showing a co-manager's pending
escalation as the owner sees it and as a follower sees it

Reproduced verbatim, including the sign-off; "Cheers," is how he signed it. Line breaks inside
paragraphs are not kept. Indexed in `docs/approvals/conditions.md`.

---

> James,
>
> Very good. Role, not name, is the right answer, and your reason is better than mine. The babysitter needs to know the warning came from someone the parent trusts with the profile. Who exactly filed it matters to the people who can act on it.
>
> The second point is the one I would guess that a judge will remember. You saw that the name was the one place a follower could learn who else is in the circle, something the rest of the app already keeps from followers. So you fixed it on the server, not just on the screen. Hiding a name in the display still sends it to the phone, where anyone who looks can find it. Withholding it at the source means it is never there to find.
>
> I checked the repo. The server test that follower views get roles only, and the client tests for the follower's card, are both on main. Answered, tested, and live, three days early.
>
> Here is my next ask. Your JUDGES.md has Noor as the follower, but no scenario that shows this rule. By your November 13 code freeze, add one row: a barcode where a co-manager has a pending escalation, and what the owner sees next to what the follower sees. Then a judge can watch the name appear in one seat and the role in the other.
>
> Cheers,
>
> Jack

---

## What this binds

1. **By Thursday, November 13, 2026:** one row in `JUDGES.md`'s barcodes table, true after a judge
   reseed, where a judge sees a co-manager's pending escalation by name in one seat and by role only
   in the other.

**Acknowledged:** his October 27, 5:57 AM ask, whether followers should see the reporter's name
("Answered, tested, and live, three days early"), closed October 27 in `conditions.md`.

## How it's met (JT, October 27)

A judge holds only three seats: owner of Maya, co-manager of Leo, follower of Noor. No judge can
sign in as Noor's owner. So the row puts one barcode on two profiles: Maya's co-manager (Priya)
reports Sesame on Maya, where the judge is the owner, and Noor's co-manager (Sam, new to Noor)
reports Wheat on Noor, where the judge follows. Each judge gets their own barcode: four judges'
pending reports of the same allergen on one barcode would be four families, and the threshold
would confirm them (`CORROBORATION_THRESHOLD`, `server/src/corrections/recordCorrection.ts`).
Different allergens on the two profiles, for the same reason.
