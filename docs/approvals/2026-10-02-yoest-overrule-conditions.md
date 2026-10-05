# Overrule widening approved, with two conditions — plus the judge demo account

**From:** Prof. Jack Yoest (yoest@cua.edu)
**Dates:** October 1 and October 2, 2026 (replies to JT's Oct 1 submission)
**Grants:** repo/live URL/screenshot logged complete; AWS deployment logged complete;
owner-or-co-manager downgrades approved

Reproduced verbatim. Referenced in `CONTEST_RULES.md` §3 and `BACKLOG.md`.

---

## October 1

> James,
> These Tasks are complete: repo, live URL, and screenshot received. And since circlebite.app already runs on your own EC2 instance, we will log your AWS deployment as complete too.
> You are weeks ahead.
> On the overrule: your reading is better than my wording. Keep owner or co-manager. You are right that a co-manager who can delete an allergen outright should not be blocked from the gentler action.
> Telling me before judging rather than after was the right call, and it is the kind of judgment the panel will notice.
> Two conditions on that widening. First, log every downgrade: who made it, when, and what evidence they gave. Then, notify the owner whenever a co-manager downgrades a verdict. The owner should never learn about a change to their child's profile by accident.
> One question on the overrule loop. You showed a warning traveling to a second family's profile. Confirm that only escalations cross family lines, and that a downgrade in one family never clears a warning in another. Put the answer in one sentence in your README.
> A small operational note: with Postgres on the same box as the app, set up automated backups now, before real circles depend on the data.
> Your next step: when "No listed allergens found" and the 911 referral are live, reply with a screenshot of each. Those two close out the safety items the judges will look for.
> 282 commits. Well done.
> Cheers,
> Jack

## October 2

> James,
> One more item for the upcoming judging next month: the live app requires sign-in, which is right for a product holding children's profiles.
> Please create a judge demo account seeded with fictional families only, no real data, and send Matthew and me the login. The judges will need it to test the overrule loop themselves.
> Thanks,
> Jack

---

## What this binds

1. **Log every downgrade** — who, when, and what evidence. `product_corrections` already carries
   `reported_by`, `created_at` and a required photo, so most of this exists as data; what does not
   exist is a place a person can *read* it as a downgrade history.
2. **Notify the owner when a co-manager downgrades.** No notification mechanism of any kind exists
   in the server today (no mail dependency, no notifications table; circle invites are links the
   parent shares by hand, migration 0008). Email would also sit badly with R6 — the hosted senders
   are hosted services, and self-hosted mail from EC2 is blocked on port 25 by default. The app's
   own precedent points to an in-app notice.
3. **The cross-family sentence** — done, in `README.md` under the MVP statement. The answer is yes
   and by construction: `applyCommunityCorrections.ts` reads corroborated `add_caution` only and
   never sets anything but `contains`.
4. **Automated Postgres backups**, on the same box as the app. Operational, not application code.
5. **Judge demo account**, fictional families only, credentials to Prof. Yoest and Matthew. This is
   the judge-seed-script item that has been open since Week 1; it now has named recipients and is a
   prerequisite for judges exercising the overrule loop at all.
6. **Reply with screenshots** of "No listed allergens found" and the 911 referral once both are live.
