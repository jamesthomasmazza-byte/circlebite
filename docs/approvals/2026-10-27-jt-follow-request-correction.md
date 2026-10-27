# Correction: owners learn of circle requests in the app, not by email

**From:** JT (James Mazza) to Prof. Jack Yoest
**Date:** October 27, 2026, evening ET (exact time not recorded), after JT's reply of the same
evening (`2026-10-27-jt-judges-reporter-row.md`)
**Corrects:** one sentence in that reply: "The owner is emailed about each new request, but not
about a repeat within 30 days of a decline, and requests are rate-limited, so an owner who has said
no is not pressed again."

Reproduced verbatim. Line breaks inside paragraphs are not kept. Indexed in
`docs/approvals/conditions.md`, "Corrections owed to Prof. Yoest".

---

> Prof. Yoest,
>
> One correction to my last email. Owners are not emailed about circle requests; CircleBite sends no email. The owner learns of a new request in the app, from a line on the Scan screen and a badge on the Circle tab, which stay until they approve or decline. The rest of that paragraph stands.
>
> Best,
> James Mazza

---

## What the repo shows

- **Accurate.** No mailer exists in `server/` or its dependencies. A waiting request shows as a
  line on Scan and a badge on the Circle tab, both staying until the owner approves or declines
  (`docs/server-setup.md` §11c; `server/src/routes/circleRequests.ts`).
- "The rest of that paragraph stands": also accurate for what it covers: no repeat within
  30 days of a decline (`DECLINED_KEPT_DAYS`) and rate limits (`isRateLimited`), both in
  `server/src/routes/circleRequests.ts`.
