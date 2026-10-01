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

- **Downgrades are owner-only.** Any circle member may escalate a verdict (report an allergen
  present). Reporting an allergen *not* present (`flag_wrong`) or the wrong product
  (`wrong_product`) — anything with direction `remove_caution` — is reserved for the parent who owns
  the profile. Today any reader can file one and it clears the allergen in their own view; that must
  change in the app, not just the README.
- **No "Safe" verdict label.** The clean verdict reads "No listed allergens found" everywhere it is
  shown — not "Safe".
- **Emergency referral in the app.** The disclaimer is accompanied by "call 911 for any allergic
  reaction". Not present in the client as of this date.
