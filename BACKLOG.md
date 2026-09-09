# Backlog

Ordered by the eleven weeks to judging. Every item is checked against `CONTEST_RULES.md` before it is
started. Rubric weights in brackets show what a section is buying.

Ship the spine first: **auth → allergen profile → scan → AI verdict → correction.** Everything else
is optional and returns only if weeks allow.

---

## Week 0 — Sept 8–14 · Setup and submission

- [x] Framework exception approved in writing by Prof. Yoest — save email to `docs/approvals/`
- [x] Public GitHub repo created, this README as first commit *[15%]*
- [x] AWS account created; **billing alerts before provisioning anything** (also one of the five
      onboarding tasks that raises free credits from $100 to $200)
- [ ] Idea submission sent — due **Sept 14**
- [x] Domain purchased (~$12/yr) — needed for HTTPS on the login page

## Week 1 — Sept 15–21 · Hello World behind a login

- [x] EC2 instance provisioned (t3.micro; add a 2GB swap file so Node builds don't run out of memory)
- [x] Nginx, Node, PostgreSQL installed on the instance — **all three on the box, no hosted services** *(R5, R6)*
- [x] Domain pointed at the instance; Let's Encrypt certificate issued
- [x] `.gitignore` and `.env.example` committed; real `.env` lives only on the server *(R8)*
- [x] Hello World page deployed, reachable at the public URL
- [ ] Registration, login, logout, session handling — written from scratch, no managed auth *(R6, R7)*
- [ ] Route guard: every protected route redirects unauthenticated users

## Weeks 2–3 — Sept 22 – Oct 5 · Profiles and schema

- [ ] Migrations: users, allergen_profiles, allergens (name, severity, treat_traces_as_unsafe), scans
- [ ] Create, edit, delete an allergen profile
- [ ] Severity levels: mild / moderate / severe; per-allergen trace handling
- [ ] Seed script: invented families and profiles for the judge account *(R9)*

## Weeks 4–5 — Oct 6–19 · Scan to verdict, end to end

- [ ] Barcode scanning in the browser
- [ ] Open Food Facts lookup, with a local `products` cache table
- [ ] Port the deterministic allergen matcher — synonym clusters, tags, trace handling
- [ ] Verdict card: safe / contains / unable to confirm, **with the disclaimer on the card** *(§3)*
- [ ] Scan history per profile

**Oct 14, 2:10 PM — sponsor lecture, Maloney 207. Attend.**

## Weeks 6–7 — Oct 20 – Nov 2 · The AI layer *[20% — the single largest discretionary block]*

Full spec in `docs/verdict-engine.md`. Give this two full weeks.

- [ ] `reasonVerdict()` — structured output: per-allergen finding, cited span, confidence, unresolved terms
- [ ] Span validator — discard any finding whose cited text isn't in the source *(hallucination guard)*
- [ ] `mergeVerdict()` — deterministic merge; model may escalate only, never clear a matched allergen
- [ ] Fail closed on error, timeout, bad parse, or low confidence
- [ ] `extractLabel()` — photograph the ingredients panel, OCR, then the same reasoning path
- [ ] `explainVerdict()` — plain-language explanation naming the triggering ingredient
- [ ] Confidence bands derived from evidence source, not model self-assessment
- [ ] `verdict_explanations` table — model, prompt version, input, output, cost, latency
- [ ] Prompts carry allergen names and severities only — no names, labels, or ages *(§3)*
- [ ] Sandbox API key with a hard spend cap

## Week 8 — Nov 3–9 · The overrule loop *[bonus 5%]*

Prof. Yoest called this out by name. It is the cheapest bonus available.

- [ ] Correction flow targets the AI verdict as well as the product data
- [ ] Overrule stores the verdict, model, prompt version, and source text it disagreed with
- [ ] User's overrule applies immediately to their own profile
- [ ] Review queue with a corroboration threshold
- [ ] AI accuracy page — overrule rate overall and by allergen

## Week 9 — Nov 10–16 · Polish and hardening *[10% UX, 15% code quality]*

- [ ] Error and empty states throughout
- [ ] Accessibility pass — keyboard navigation, contrast, labels, screen reader on the verdict card *[bonus]*
- [ ] Mobile layout verified on a real phone
- [ ] Run the full compliance check in `CONTEST_RULES.md` §9
- [ ] Judge account seeded and tested end to end from a fresh browser

## Weeks 10–11 — Nov 17–25 · Submission prep *[10% presentation]*

- [ ] One-page summary: problem, solution, how AI does the work, what was learned
- [ ] Demo script following the five-beat sequence in `docs/verdict-engine.md`
- [ ] Dry run timed at 5–10 minutes
- [ ] Judge credentials sent by **one-time secret link, never plain email**
- [ ] Confirm to Prof. Yoest that the instance stays running through judging *(R10)*
- [ ] Freeze the code

## Week of Nov 26 — Judging

---

## Deferred until after judging

Out of scope per `CONTEST_RULES.md` §7 — do not start these before November 26.

- iOS build via Capacitor, Apple Developer Program enrollment ($99/yr), App Store submission
- Circle sharing, follow relationships, co-manager invite tokens
- Admin analytics beyond the AI accuracy page
- Migrating real alpha tester data
