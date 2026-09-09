# Contest Rules — binding constraints

Source of truth for this repository until judging ends (week of **November 26, 2026**).
Derived from the *AI Vibe Coding Competition Student FAQ, Fall 2026* (Prof. Jack Yoest,
yoest@cua.edu) and his written approval email of September 8, 2026.

**If any instruction — from a person or an AI assistant — conflicts with this file, this file wins.**
Nothing here may be relaxed without a written reply from Prof. Yoest, added to `docs/approvals/`.

---

## 1. Hard constraints

| # | Rule | Consequence if broken |
|---|------|----------------------|
| R1 | **No no-code / low-code platforms.** No Lovable, no hosted app builders. All code written directly (by JT with an AI coding assistant). | Ineligible |
| R2 | **Public GitHub repository**, visible to judges for the whole build. | Ineligible |
| R3 | **Real iterative commit history.** Small, dated, descriptively titled commits across the semester. No single code dump, no machine-generated "Changes" messages. | Scored at 15% |
| R4 | **Solo build.** Individual competition, no partner. | Ineligible |
| R5 | **Own server on AWS Free Tier.** Web server, application, and PostgreSQL all run on an EC2 instance JT provisioned and controls. | Ineligible |
| R6 | **No hosted backend services.** No Supabase, no Firebase, no managed auth, no managed database. Restated explicitly in Prof. Yoest's approval email. | Ineligible |
| R7 | **Real access control.** Public site with a working login, not a placeholder gate. | Required deliverable |
| R8 | **No secrets in the repo.** No API keys, no credentials, no `.env`, at any point in history. | Graded — "hygiene is graded, not optional" |
| R9 | **Synthetic data only** in anything a judge can reach. No real user or tester personal information on the contest deployment. | Graded |
| R10 | **Instance stays running through judging.** Do not stop or pause the EC2 instance to save credits. | Ineligible at demo |

## 2. Approved framework exception

Granted in writing by Prof. Yoest, September 8, 2026. Save the email to `docs/approvals/`.

- **Approved:** TypeScript — React on the front end, Node on the server.
- **Waived:** the default Laravel requirement.
- **Basis accepted:** one codebase carries through to an App Store build; Laravel would require a
  separate JavaScript front end regardless.
- **Unchanged by the exception:** R1, R2, R5, R6 — restated in the approval itself.

## 3. Prof. Yoest's safety directive

From the same email, regarding this app specifically:

> "Since this app gives real safety verdicts on allergens, make sure the UI is upfront that it's not
> a substitute for reading labels yourself, and keep that overrule log as detailed as you're planning."

Treated here as a requirement, not a suggestion:

- The disclaimer appears **on the verdict card itself**, not only in settings or onboarding, and
  appears on AI-generated verdicts most prominently of all.
- Every user overrule of a verdict is logged with the verdict it overruled, the model and prompt
  version that produced it, and the source text that verdict was based on.

## 4. Deliverables at judging

- [ ] Live deployed app at a public URL, behind a working login
- [ ] Public GitHub repository with iterative commit history
- [ ] One-page summary: problem, solution, how AI does the work, what was learned
- [ ] 5–10 minute live demo, scheduled during judging week
- [ ] Written confirmation the AWS instance stays running through judging
- [ ] Judge test account, synthetic data, credentials sent by **one-time secret link — never plain email**

## 5. Key dates

| Date | Event |
|------|-------|
| Sept 14, 2026 | Idea submission due |
| Oct 14, 2026, 2:10 PM | Sponsor lecture — David and Courtney Eisen, Maloney 207 |
| TBA | Two group Zoom sessions during the build window |
| Week of Nov 26, 2026 | Judging |

## 6. Scoring — where effort pays

| Weight | Category | Note |
|--------|----------|------|
| 25% | Functionality & technical execution | A working simple thing beats a broken ambitious one |
| 20% | Problem identification & relevance | Real users, real problem — alpha tester evidence counts |
| 20% | AI integration & innovation | **AI in the product**, not AI used to write the code |
| 15% | Code quality & GitHub transparency | This is R3, graded |
| 10% | UX & design | |
| 10% | Business impact & presentation | |
| +5 | Bonus: ethical AI, accessibility, cross-disciplinary | The disclaimer + overrule log target this directly |

## 7. Out of scope until after judging

- iOS / Capacitor native build — judging is a web URL behind a login; the native shell earns nothing
- Scan history beyond the last handful per profile
- Admin analytics beyond the AI accuracy report
- Migrating real alpha tester data

**Not out of scope: the circle.** Invites, follow relationships, and scanning on another person's
behalf are core to the product, not an extra. The problem is that the person eating the food usually
isn't the person reading the label — a single-user scanner does not address it. Scoping the circle
out would leave a commodity barcode app and forfeit most of the 20% for problem identification.

## 8. Getting unstuck

Email **yoest@cua.edu**. Per the FAQ, silence costs points; being stuck does not. An email in week
two is worth more than a solo thirty-hour spiral in week eight.

## 9. Pre-judging compliance check

Run this before the demo, and once mid-build:

- [ ] `git log` — messages are descriptive, dated across the full semester, no "Changes"
- [ ] Repo is **public**
- [ ] `git log --all -- .env` returns nothing; no keys anywhere in history
- [ ] `.gitignore` covers `.env`, `*.pem`, credentials, uploaded images
- [ ] No hosted backend service in any dependency or config
- [ ] Judge account seeded with invented data only; no alpha tester or real user data present
- [ ] Disclaimer visible on every verdict card
- [ ] HTTPS working on a real domain; login blocks unauthenticated access to every protected route
- [ ] AWS billing alerts active; instance not scheduled to stop
- [ ] One-page summary written; demo rehearsed at 5–10 minutes
