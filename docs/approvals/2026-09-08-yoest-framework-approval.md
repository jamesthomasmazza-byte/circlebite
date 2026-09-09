# Framework approval and prior-work clearance

**From:** Prof. Jack Yoest (yoest@cua.edu)
**Date:** September 8, 2026
**Grants:** (1) exception to the default Laravel requirement, (2) clearance of the disclosed Lovable prototype

Reproduced verbatim. This is the written approval referenced in `CONTEST_RULES.md` §2 and §3.

---

> James,
>
> Thanks for getting both of these in front of me early — this is exactly the right way to handle it.
>
> On the disclosure: you're clear. The rule against no-code tools is about what you build and submit
> for the contest, not about whether you'd thought about a problem beforehand. Since you're not
> submitting anything built on Lovable, you're starting a fresh public repo with commit history from
> this week, and the food-allergy scanner is a problem you clearly care about, go ahead and build it.
> I'd rather have a contestant who's already thought hard about the problem than one starting cold.
>
> One non-contest note: since this app gives real safety verdicts on allergens, make sure the UI is
> upfront that it's not a substitute for reading labels yourself, and keep that overrule log as
> detailed as you're planning. Good instinct on your part already.
>
> On the framework: approved. TypeScript/React on the front end and Node on the server is fine. Your
> reasoning — one codebase that carries straight through to an App Store build instead of maintaining
> Laravel plus a separate JS front end — is a legitimate technical case, not just a preference, and
> that's the bar I want for framework exceptions. Same rules apply as written: fresh public repo, no
> Lovable, your own EC2 instance and Postgres, no hosted backend services.
>
> Good luck with the build — the verdict engine concept, especially the ingredient-level citation and
> overrule logging, sounds like a strong entry.
>
> Cheers,
> Jack

---

## What this binds

- TypeScript / React / Node approved; Laravel requirement waived.
- Restated as still binding, in the approval itself: fresh public repo, no Lovable, own EC2 instance
  and PostgreSQL, **no hosted backend services**.
- The safety note is treated as a requirement in `CONTEST_RULES.md` §3, not as advice.
