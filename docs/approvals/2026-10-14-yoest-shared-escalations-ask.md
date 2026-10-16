# Condition 3 closed — shared-escalations fix requested, judging moved to November 20

**From:** Prof. Jack Yoest (yoest@cua.edu)
**Date:** October 14, 2026, 07:20 UTC (3:20 AM Eastern)
**Grants:** Condition 3 accepted as closed; the shared-escalations direction approved
**Moves:** judging to November 20, 2026, over Zoom (second excerpt below)

Reproduced verbatim. Indexed in `docs/approvals/conditions.md`.

---

> James,
>
> Condition 3 is closed. Thank you.
>
> The asymmetry is the right design, and you stated the reason better than I
> did: a false alarm costs a second look at a label, while a false all-clear
> can cost a child. Two families to raise, three to clear, and no removal
> while a confirmed warning stands is a rule a parent can trust.
>
> What impressed me most is not the rule. It is that you found two problems
> yourself and told me about both. The "Peanut" and "peanut" bug is a
> textbook case of a safety change creating a new hazard, and you caught it
> because you tested the change instead of assuming it.
>
> Then you found the gap between your README and your code and corrected the
> README the same night. Most founders discover that gap when a customer
> does. Keep that habit; it is worth more than any feature.
>
> Your proposed fix is sound. Warnings should travel easily inside a
> family; clearings should not. One thing to think through as you build it:
> when a co-manager sees a pending escalation, how does the screen tell them
> it is one family's report and not yet a corroborated warning?
>
> The label matters as much as the logic.
>
> And one challenge for the road ahead. Your corroboration rule counts
> distinct families. What stops one determined person from creating a
> second family to corroborate themselves?
>
> I don't need it solved this week, but I want your thinking on it.
>
> Here is my ask. By Monday, October 19, if possible, send me the commit link
> for the shared-escalations fix, with tests covering three cases: "Peanut"
> and "peanut" corroborating each other, a lactose report and a whey report
> failing to clear a milk warning, and a co-manager's pending escalation
> visible to the child's parent. Add two or three sentences on the
> second-family question.
>
> Cheers,
>
> Jack

## Judging date — a separate thread, also October 14

An excerpt, not the whole message. JT supplied only this line; the time of day wasn't recorded.

> we've penciled in 20 November -- but this will be a Zoomer -- not in person.

---

## What this binds

1. **By Monday 2026-10-19:** the commit link for the shared-escalations fix (`BACKLOG.md`,
   decided 2026-10-13), with tests for three cases:
   - "Peanut" and "peanut" corroborating each other;
   - a lactose report and a whey report failing to clear a milk warning;
   - a co-manager's pending escalation visible to the child's parent.
2. **Two or three sentences on the second-family question.** He says he doesn't need it solved,
   only the thinking.
3. **The label, not only the logic.** A pending escalation's screen has to say it is one family's
   report and not a corroborated warning.
4. **Judging is November 20, 2026, over Zoom.** It replaces "week of November 26" everywhere this
   repo states a judging date. Anything planned for the Monday of judging week (Nov 23) now falls
   after judging and moves to the week of November 16.
5. **Not covered by this email:** the evidence of a test restore he asked for on October 6. It is
   still owed (`conditions.md`, Condition 4).
