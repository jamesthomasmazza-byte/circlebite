# MVP statement approval — with two required changes

**From:** Prof. Jack Yoest (yoest@cua.edu)
**Date:** October 1, 2026 (reply to JT's Week 1 heads-up)
**Grants:** (1) no "Coming Soon" skeleton needed — submit the current app; (2) MVP statement approved
with two changes

Reproduced verbatim. Referenced in `CONTEST_RULES.md` §3.

---

> James,
> Thank you for the heads-up. You are well ahead of schedule, and that is a good place to be.
> No need to build a "Coming Soon" page.
> Submit the repo link and a screenshot of the current app. Please also include the circlebite.app URL so we can log your next task deployment as complete.
> MVP statement: This is strong. It is clear, specific, and the rule that the AI may escalate but never clear an allergen the matcher found is exactly the right instinct. Approved, with two changes before it goes in the README.
> First, the overrule. As written, any circle member can overrule a verdict. A babysitter who overrules "contains" to "safe" puts a child at risk. Let any circle member escalate a verdict, but reserve downgrades for the parent who owns the profile.
> Second, the word "safe." A label can be clean, and the product still carry cross-contact risk. Consider "no listed allergens found" in place of "safe," and add one sentence to the statement noting the in-app disclaimer and the emergency referral (call 911 for any allergic reaction).
> We discussed this for safety-adjacent apps, and the judges will look for it.
> Make those two changes, put the revised paragraph in your README, and send me the repo link, screenshot, and live URL at your convenience.
> Well done,
> Jack

---

## What this binds

- **Downgrades: owner-only as dictated, widened to owner or co-manager the same day.** Any circle
  member may escalate a verdict (report an allergen present). Reporting an allergen *not* present
  (`flag_wrong`) or the wrong product (`wrong_product`) — anything with direction `remove_caution` —
  is reserved for the parent who owns the profile. As of this email, any reader could file one and
  it cleared the allergen in their own view. Closed in the app on October 1:
  `server/src/routes/corrections.ts` refuses a `remove_caution` report from a follower (403
  `removal_requires_manager`), and the report form offers a follower only `flag_missing`
  (`reportableTypes`, `client/src/lib/correctionCopy.ts`). Superseded the same day: on October 1 he
  approved widening downgrades to the owner or a co-manager they invited ("Keep owner or
  co-manager."), with two conditions — see [the overrule-conditions
  approval](2026-10-02-yoest-overrule-conditions.md).
- **No "Safe" verdict label.** The clean verdict reads "No listed allergens found" everywhere it is
  shown — not "Safe".
- **Emergency referral in the app.** The disclaimer is accompanied by "call 911 for any allergic
  reaction". Not present in the client as of this date.
