# Backlog

Ordered by the eleven weeks to judging. Every item is checked against `CONTEST_RULES.md` before it is
started. Rubric weights in brackets show what a section is buying.

Ship the spine first: **auth → allergen profile → circle invite → scan → AI verdict → correction.**
Everything else is optional and returns only if weeks allow.

The circle is part of the spine, not an extra. The premise is that the person holding the package
often isn't the person whose allergies are at stake.

---

## Week 0 — Sept 8–14 · Setup and submission

- [x] Framework exception approved in writing by Prof. Yoest — save email to `docs/approvals/`
- [x] Public GitHub repo created, this README as first commit *[15%]*
- [x] AWS account created; **billing alerts before provisioning anything** (also one of the five
      onboarding tasks that raises free credits from $100 to $200)
- [x] Idea submission sent (Sept 9) — Golden Circle framing, one-page PDF, links to the live site and repo
- [x] Domain purchased (~$12/yr) — needed for HTTPS on the login page

## Week 1 — Sept 15–21 · Hello World behind a login

- [x] EC2 instance provisioned (t3.micro; add a 2GB swap file so Node builds don't run out of memory)
- [x] Nginx, Node, PostgreSQL installed on the instance — **all three on the box, no hosted services** *(R5, R6)*
- [x] Domain pointed at the instance; Let's Encrypt certificate issued
- [x] `.gitignore` and `.env.example` committed; real `.env` lives only on the server *(R8)*
- [x] Hello World page deployed, reachable at the public URL
- [x] Registration, login, logout, session handling — written from scratch, no managed auth *(R6, R7)*
- [x] **Neutral date-of-birth age gate at signup**, enforced server-side; store `age_attested_adult`
      and `age_attested_at` only, never the raw DOB *(`docs/coppa.md` §2.1)*
- [x] Retry prevention on a failed age gate; under-18 failure screen with no "try again"
- [x] Adult-manager terminology throughout — "a profile you manage", never "your allergies"
- [ ] Authorization checks in application code on every query — no RLS layer exists here
      *(convention documented in `server/src/authorization/README.md`; no resource-scoped route
      exists yet to apply it to — real work starts in weeks 2–3 with allergen_profiles)*
- [x] Route guard: every protected route redirects unauthenticated users

## Weeks 2–3 — Sept 22 – Oct 5 · Profiles, schema, and the circle

- [x] Migrations: allergen_profiles, allergens (name, severity, treat_traces_as_unsafe)
      *(`scans` deliberately left out of this migration set — weeks 4–5, no scan flow exists yet
      to attach it to)*
- [x] Migrations: profile_managers, follow_relationships (status, share_level), manager_invites
- [x] Create, edit, delete an allergen profile
- [x] Severity levels: mild / moderate / severe; per-allergen trace handling
- [x] **Invite someone into a profile's circle** — single-use token link, accept flow, revoke
- [x] Share levels: full profile vs. severe allergens only
- [ ] Profile picker: a user in multiple circles chooses whose profile they're scanning for
      *(the scan flow itself doesn't exist yet — weeks 4–5)*
- [ ] **Deletion design, decided here not in week 9** — FK cascade shape decided and implemented
      for everything that exists so far (`allergen_profiles`, `allergens`, `profile_managers`,
      `follow_relationships`, `manager_invites` — see those migrations' comments for the
      CASCADE-vs-SET-NULL reasoning, verified empirically against real Postgres). Still open:
      `scans`/`corrections` don't exist yet, so their cascade can't be finished until weeks 4+;
      no `DELETE /account` endpoint yet — not a Week 2–3 backlog item, same reasoning as Week 1's
      auth session (`docs/coppa.md` §2.6)
- [ ] Retention: scan history older than 24 months purged automatically, and the job actually runs
      *(`docs/coppa.md` §2.7 — an unenforced stated policy is worse than none)*
- [ ] Seed script: invented families, profiles, and circle members for the judge account *(R9)*

## Weeks 4–5 — Oct 6–19 · Scan to verdict, end to end

- [x] Barcode scanning in the browser — manual entry plus camera scanning via `@zxing/browser`.
      Camera shipped with a real bug (video element conditionally mounted, so the live stream had
      nowhere on-page to bind to — decoding could work with nothing ever visible); fixed and
      confirmed working on a real device the same night, see `docs/journal.md`
- [x] Open Food Facts lookup, with a local `products` cache table (24h TTL, caches confirmed
      not-found too)
- [x] Port the deterministic allergen matcher — synonym clusters, tags, trace handling
- [x] Verdict card: **the full four-state taxonomy from `docs/legacy-spec.md` §4** (safe / contains
      / may-contain-caution / unable-to-confirm), not the abbreviated three states above — this
      line was written before `treat_traces_as_unsafe` existed; building only three states now
      would throw that field away. **Disclaimer on the card** *(§3)*, exact wording from
      `docs/verdict-engine.md`, rendered unconditionally
- [x] Scan history per profile — capped, share-level filtered same as the profile page

**Oct 14, 2:10 PM — sponsor lecture, Maloney 207. Attend.**

## Weeks 6–7 — Oct 20 – Nov 2 · The AI layer *[20% — the single largest discretionary block]*

Full spec in `docs/verdict-engine.md`. Give this two full weeks.

- [x] `reasonVerdict()` — structured output: per-allergen finding, cited span, confidence, unresolved
      terms *(Path B only — barcode found, free ingredient text, no structured tags. Paths A/C/D
      not attempted yet; see `docs/journal.md` 2026-09-10)*
- [x] Span validator — discard any finding whose cited text isn't in the source *(hallucination guard)*
- [x] `mergeVerdict()` — deterministic merge; model may escalate only, never clear a matched allergen
- [x] Fail closed on error, timeout, bad parse, or missing key — verified against the real route
      with no `AI_API_KEY` configured, and both directions now confirmed live: a real deployed
      call escalating a real finding, and the deterministic matcher independently confirmed
      unaffected either way *(`docs/journal.md` 2026-09-10, evidence in `docs/evidence/`)*
- [ ] `extractLabel()` — photograph the ingredients panel, OCR, then the same reasoning path *(Path
      C, not started — Path B was the smallest useful slice and comes first per spec)*
- [x] `explainVerdict()` — plain-language explanation naming the triggering ingredient
- [x] Confidence bands derived from evidence source, not model self-assessment *(Path B only ever
      produces medium/low — "high" requires structured tags, i.e. Path A, not attempted yet)*
- [x] `verdict_explanations` table — model, prompt version, input, output, cost, latency
- [x] Prompts carry allergen names and severities only — no names, labels, or ages *(§3, asserted by
      a test that fails if profile identity ever leaks into the prompt)*
- [x] Sandbox API key with a hard spend cap — in-app daily cap enforced in code
      (`AI_DAILY_SPEND_CAP_CENTS`), console-side cap confirmed set on the actual sandbox key

**Path B confirmed working end to end against the real deployed app with a real key** — the AI
call, the escalation, the span validation, the spend/reproducibility tracking, and a real defect it
surfaced in the deterministic matcher (fixed, see `docs/journal.md` 2026-09-10) are all verified
against production, not just unit tests. Paths A (AI-authored explanation only)/C (OCR)/D
(reconciliation) remain future work.

## Week 8 — Nov 3–9 · The overrule loop *[bonus 5%]*

Prof. Yoest called this out by name. It is the cheapest bonus available.

- [x] Correction flow targets the AI verdict as well as the product data — `target`/
      `verdict_explanation_id` derived automatically from whether the disputed allergen was
      `aiEscalated` on that scan, not trusted from the client
- [x] Overrule stores the verdict, model, prompt version, and source text it disagreed with —
      denormalized at write time (`docs/principles.md`'s N17 precedent), not left to a join
- [x] User's overrule applies immediately to their own profile — verified in a real browser:
      report a correction, scan history immediately shows the corrected verdict as the headline
      with a transparency callout naming the original and why it changed, never silent
- [x] Corroboration threshold — 1 report to add a caution, 3 to remove one, asymmetric per
      `docs/legacy-spec.md` §6, with "the warning survives" conflict handling; verified against real
      Postgres, not just unit-level. **Not built yet:** an actual browsable review queue page — the
      threshold mechanism and status field exist and work, but there's no UI listing pending
      corrections across the app.
- [x] **Corroborated additions reach other profiles** — a corroborated "this allergen is in here"
      report escalates that allergen to "contains" on any profile that has it (spelling and synonym
      differences handled by the matcher), labeled as a shopper report, never as label data. Behind
      the `COMMUNITY_CORRECTIONS` kill switch (off by default), with a per-report undo and a
      per-scan audit column — `docs/server-setup.md` §11. Verified end to end against the compiled
      server and real Postgres. **Removals deliberately don't propagate** — JT's call, precedent in
      `docs/principles.md`: signup is open, so three throwaway accounts could otherwise clear a
      warning for everyone.
- [ ] Review queue page — browse corrections and reject one from the UI instead of SQL. Prerequisite
      for ever letting corroborated removals reach other profiles, along with fixing the reverse
      "warning survives" gap noted in `recordCorrection.ts`.
- [ ] AI accuracy page — overrule rate overall and by allergen. Not started — the recording path
      (this week's actual priority) is what needed to go live first, since the accuracy number needs
      months of real scans to mean anything regardless of when the page itself ships.

## Week 9 — Nov 10–16 · Polish and hardening *[10% UX, 15% code quality]*

- [ ] Error and empty states throughout
- [ ] Accessibility pass — keyboard navigation, contrast, labels, screen reader on the verdict card *[bonus]*
- [ ] Mobile layout verified on a real phone
- [ ] Run the full compliance check in `CONTEST_RULES.md` §9
- [ ] Run the age-gate verification checklist in `docs/coppa.md` §4
- [ ] Password reset flow — must revoke all other sessions for that user on success (set
      `revoked_at` on every session row except the new one). Found doing a manual password
      rotation for the judge account: there's no change-password flow yet, so the old session
      stayed live after the password changed, which defeats the point of a rotation.
- [ ] Account deletion: removes profiles, scans, corrections, follow relationships
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
- Admin analytics beyond the AI accuracy page
- Scan history beyond the last handful per profile
- Migrating real alpha tester data
