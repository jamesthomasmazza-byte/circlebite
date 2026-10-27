# Reply: the reporter row is in JUDGES.md, plus circle requests and guided sign-up

**From:** JT (James Mazza) to Prof. Jack Yoest
**Date:** October 27, 2026, evening ET (exact time not recorded), in the same thread as his
October 27, 2:51 PM email
**Answers:** his October 27, 2:51 PM ask (`2026-10-27-yoest-judges-reporter-row.md`): "By your
November 13 code freeze, add one row: a barcode where a co-manager has a pending escalation, and
what the owner sees next to what the follower sees."

Reproduced verbatim as sent; JT revised the draft before sending. Line breaks inside paragraphs are
not kept. Indexed in `docs/approvals/conditions.md`.

---

> Prof. Yoest,
>
> Done. JUDGES.md now has the row, and the judge reseed creates the scenario behind it. Each judge scans one barcode twice. On Maya, whose owner they are, the card reads "Priya Nair (co-manager) reported Sesame present and photographed the label. No other family has confirmed it yet." On Noor, whom they follow, it reads "A co-manager in Noor's circle reported Wheat present and photographed the label. No other family has confirmed it yet." Each judge gets a barcode of their own, so the four judges' copies never count as four families and turn a pending report into a confirmed one, and the seed fails if either report ever would. It goes live on production with the judging-week reseed.
>
> Two other changes since my last report, both live on production as of October 27:
>
> Circle requests. Someone can now ask to join a child's circle, and the owner approves or declines. The requester sees nothing of the profile until the owner approves. The owner is emailed about each new request, but not about a repeat within 30 days of a decline, and requests are rate-limited, so an owner who has said no is not pressed again.
>
> Guided sign-up. A new account is now set up one question per screen and goes straight into building the child's profile. The age gate is unchanged: the same date-of-birth question, nothing mentions 18 before it is answered, and there is no retry after a refusal.
>
> Best,
> James Mazza

---

## What the repo shows

- **The row:** `255f867` (the seed and its tests) and `f91691a` (the `JUDGES.md` row), pushed
  October 27 in `cd97de2`. Both card sentences are word for word what judge1 saw locally at 390px
  on October 27. The seed failing if a report would be confirmed: `SeedCircleReportCorroboratedError`
  in `server/src/db/seed/judgeSeed.ts`, tested in `judgeSeed.test.ts`.
- **"It goes live on production with the judging-week reseed":** accurate, and it still needs a
  deploy before the November 13 freeze first (`BACKLOG.md`, "Nov 13 — code freeze").
- **Circle requests:** live on production since October 27, `CIRCLE_REQUESTS=on` (`BACKLOG.md`
  item 6). "The requester sees nothing of the profile until the owner approves" matches the plan
  and the October 27 check. No repeat within 30 days of a decline (`DECLINED_KEPT_DAYS`) and rate
  limits (`isRateLimited`) both match `server/src/routes/circleRequests.ts`.
  - **"The owner is emailed about each new request": the app sends no email.** No mailer exists in
    `server/` or its dependencies. The owner is told in the app: a line on Scan and a badge on the
    Circle tab until they approve or decline (`docs/server-setup.md` §11c). Found October 27, after
    sending. **Corrected to him the same evening** (`2026-10-27-jt-follow-request-correction.md`).
  - "Ask to join a child's circle": a request goes to the owner by their exact email address, never
    to a profile. The owner picks which of their profiles to share, and at what level.
- **Guided sign-up:** `2dd7f35`, deployed in `c737cdf` on October 27 with `GUIDED_SETUP` on. The
  age-gate claims match the commit and `docs/coppa.md` §2.1: the same "Date of birth" question with
  nothing about 18 before it, the same server check, and the same refusal with no retry.
