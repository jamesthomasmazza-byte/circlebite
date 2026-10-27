# Correction: owners learn of circle requests in the app, not by email

**From:** JT (James Mazza) to Prof. Jack Yoest
**Date:** October 27, 2026, evening ET (exact time not recorded), after JT's reply of the same
evening (`2026-10-27-jt-judges-reporter-row.md`)
**Corrects:** one sentence in that reply: "The owner is emailed about each new request, but not
about a repeat within 30 days of a decline, and requests are rate-limited, so an owner who has said
no is not pressed again."

The email's text isn't saved here. What follows is its substance, as JT recorded it. Indexed in
`docs/approvals/conditions.md`, "Corrections owed to Prof. Yoest".

---

**What it said:** owners learn of circle requests in the app, from a line on Scan and a badge on the
Circle tab, not by email. CircleBite sends no email.

## What the repo shows

- **Accurate.** No mailer exists in `server/` or its dependencies. A waiting request shows as a
  line on Scan and a badge on the Circle tab until the owner approves or declines
  (`docs/server-setup.md` §11c; `server/src/routes/circleRequests.ts`).
- The rest of the corrected sentence stood and wasn't part of the correction: no repeat within
  30 days of a decline (`DECLINED_KEPT_DAYS`) and rate limits (`isRateLimited`), both in
  `server/src/routes/circleRequests.ts`.
