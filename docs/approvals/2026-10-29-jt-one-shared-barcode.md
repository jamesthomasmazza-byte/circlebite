# One shared barcode for every judge: built and deployed

**From:** JT (James Mazza) to Prof. Jack Yoest
**Date:** October 29, 2026 (exact time not recorded), after the deploy of `154a6ba`
**Answers:** his October 27, 7:55 PM email (`2026-10-27-yoest-one-shared-barcode.md`)

Reproduced verbatim as sent. Line breaks inside paragraphs are not kept. Indexed in
`docs/approvals/conditions.md`.

---

> Prof. Yoest,
>
> Done. Every judge will scan the same barcode, 2990000000083, and the separation is in the data: each judge account and its seeded circle belong to that judge's own world, and a report counts toward confirmation only within its own world. Two judges reporting the same allergen on the same product each stay at one family, and that includes reports judges file themselves while testing. Real families are counted by the same rule as before, two families to warn and three to clear, and a judge's report never counts toward theirs.
>
> It is deployed to production as of today, October 29, and takes effect on the judge accounts with the judging-week reseed.
>
> Best,
> James Mazza

---

## What the repo shows

Before it was sent, each sentence was checked against the code. Two were reworded to say no more
than the code does: "will scan", not "now scans", and "by the same rule as before", not "exactly as
before".

- **One barcode:** `2990000000083` for every judge (`server/src/db/seed/seedData.ts`, `JUDGES.md`).
- **Worlds:** `users.judge_world`, set only by the judge seed (`server/src/db/judgeWorld.test.ts`).
  Each report is stamped by trigger at insert (migration 0049), so reports a judge files while
  testing are stamped the same way (`server/src/db/seed/judgeSeed.test.ts`).
- **Counting:** a claim counts and confirms only its own world's reports
  (`countCorroboratingFamilies`, `corroborateClaimIfThresholdMet` in
  `server/src/corrections/recordCorrection.ts`; `judgeWorldCorroboration.test.ts`).
- **Same rule for real families:** two families to warn, three to clear (`CORROBORATION_THRESHOLD`).
  The tests that pin it, in `recordCorrection.test.ts`, are unedited.
- **Deployed:** October 29, about 12:10 PM ET, `154a6ba`, release `20261029160944`.
- **When it takes effect:** production's seeded accounts get their worlds at the judging-week
  `--rotate-passwords` reseed. Until then, a judge account on production has no world.
