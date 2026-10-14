# The corroboration challenge, downgrade-history and restore evidence, and JUDGES.md

**From:** Prof. Jack Yoest (yoest@cua.edu)
**Dates:** October 6, 2026, 9:32 PM and 10:18 PM (replies to JT's two Oct 5 emails: the safety
items and cross-family answer, and the judge demo handoff)
**Grants:** none. **Binds:** the corroboration challenge — define "corroborated" in one README
sentence — plus five requests listed below

Reproduced verbatim. Signature blocks omitted, as in the earlier approval files. Indexed in
`docs/approvals/conditions.md`.

---

## October 6, 9:32 PM

> James,
> This is the most rigorous safety work I have seen in the contest, and you closed both conditions with room to spare.
> Replacing "safe" with "No listed allergens found," and writing a test so it can never come back, is exactly the discipline an allergy app demands. Putting the 911 referral on every verdict card, not only the good news, shows you understand who reads these screens and when.
> Your answer on the overrule loop is the insight I will remember: only escalations cross family lines, and a downgrade has no code path to travel. You did not write a rule the software has to remember to enforce; you built a structure where the dangerous outcome cannot happen.
> That is design, not policy, and judges will notice the difference.
> Your choices on notification and the README correction are both sound. An in-app notice fits how the app already works, and catching your own outdated README line is the kind of honesty that builds trust in everything else you write.
> One challenge for this week, offered as an invitation. You have protected against three throwaway accounts clearing a warning.
> Now ask the mirror question: what counts as "corroborated"?
> How many reports, from how many distinct families, before an escalation fires?
> A false alarm is far less dangerous than a false all-clear, but a parent who sees warnings that turn out to be wrong will soon stop trusting the real ones. Put your answer in one sentence in the README, the way you did for the overrule loop.
> Two requests. When the downgrade-history view is live, send me a screenshot. And when your nightly backup is in place, send me evidence of one successful test restore. ( A backup you have never restored is only a hope.)
> Since your instance is running through judging, confirm you have a billing alert set on your AWS account. Your live URL also satisfies Week 2, so please send it to me and Matthew by Saturday, October 10, to close out that milestone formally.
> Thank you for handling the demo login by one-time link. That is the right instinct.
> Cheers,
> Jack

## October 6, 10:18 PM

> James,
> Received, and thank you. This is a model judge handoff: a one-time link instead of a password in email, invented data top to bottom, and a test plan that walks a judge straight to the rule that matters. The two-scan demonstration of the cross-family rule, Maya then Leo, is exactly how to prove a design claim rather than just state it.
> And naming the allergen the card could not verify, instead of letting silence imply "clean," is the kind of honesty that should be in every safety app.
> We will leave the link unopened for now and use the fresh one you send on the Monday of judging week.
> Two requests:
> 1. Put this test plan in your repository as a short JUDGES.md file, without the password. Judges will look for it there, and it should live with the code rather than in my inbox. When you do, add Noor's barcode, 2990000000069, to the table so every scenario is in one place.
> 2. Tell me whether all four judges can share the single demo account at the same time without stepping on each other. If one judge files a report, does another judge see a changed verdict? If so, either seed a separate account per judge or tell judges the order to test in.
> Your live URL still closes out Week 2. Please send it on or about Saturday, October 10.
> Cheers,
> Jack

---

## What this binds

1. **Define "corroborated" in one README sentence** — how many reports, from how many distinct
   families. Answered in the README on 2026-10-07 (`4e622f2`, "A warning reaches other families
   only once two families have reported it"), alongside the code change that raised the add
   threshold from one report to two families. **Not yet answered to him by email** as of
   2026-10-13.
2. **Screenshot of the downgrade-history view.** Sent 2026-10-08:
   `circlebite-downgrade-history-2026-10-08.jpg` in this folder.
3. **Evidence of one successful test restore.** The Oct 8 email described the restore; no
   restore evidence was attached to it.
4. **Confirm an AWS billing alert.** Confirmed in the Oct 8 email.
5. **Live URL to him and Matthew by Oct 10.** Sent Oct 8.
6. **`JUDGES.md` in the repo, without the password, with Noor's barcode.** Done: in the repo with
   barcode 2990000000069 and no password (checked 2026-10-13); reported in the Oct 8 email.
7. **Can four judges share one account?** Answered Oct 8: four separate judge logins.

"You closed both conditions" in the 9:32 PM email refers to the two safety items from his Oct 2
email ("No listed allergens found" and the 911 referral), not to Conditions 1–4 in
`conditions.md`.
