# Backlog

Ordered by the eleven weeks to judging. Every item is checked against `CONTEST_RULES.md` before it is
started. Rubric weights in brackets show what a section is buying.

Ship the spine first: **auth → allergen profile → circle invite → scan → AI verdict → correction.**
Everything else is optional and returns only if weeks allow.

The circle is part of the spine, not an extra. The premise is that the person holding the package
often isn't the person whose allergies are at stake.

---

## Plan to judging (set Oct 26) — code freeze Nov 13

Set by JT on 2026-10-26. Five items move into it: three that were in "Deferred until after
judging" (1, 5, 6) and two new ones (3, 7). None is a `CONTEST_RULES.md` §7 item. Each week's
guard is written under it; an item that can't meet its guard by the freeze doesn't ship.

**JT, anytime (no code):**
- [ ] Rename the duplicate "James Mazza" profile.
- [x] Phone check of the scanner box: portrait and landscape, "Got it" before the result.
  *Done on JT's iPhone, on production: live picture, "Got it", and landscape clear of the tab bar
  on 2026-10-26 (`076eefb`); portrait with Stop camera above the tab bar, and "Got it" then the
  result in portrait, on 2026-10-27 (`docs/journal.md`).*
- [ ] Owner-only acknowledgement check on production.

### Week of Oct 26 — low risk

1. [x] **Label-photo fallback when the barcode won't read** (~8 s, offer only, no camera changes).
   Moved from "Deferred". While the scanner keeps running, offer the ingredients-label photo for
   the selected profile — an offer, not an automatic switch (the reasoning in the Week 9 scanner
   item). The decoder and camera code don't change.
   *Done: `ae49968`, deployed 2026-10-26 in `076eefb` and checked on JT's iPhone.*
2. [x] **UX polish:**
   - camera as the single primary button;
   - a slim Changes-to-review line on Scan — stays until acknowledged (Condition 2), the full
     version on Profile;
   - Circle invite copy: "Invite you sent · not used yet", with Copy link / Cancel;
   - empty states with a next step;
   - the Scan button covering the Circle link;
   - a remove-row control on the add-profile form.

   *Done: `9a0ccb7`–`076eefb`, deployed 2026-10-26. Checked on JT's iPhone: the slim notice on
   Scan, Copy link on a new invite, and the landscape layout. An invite already sent gets "New
   link" instead of Copy link (the server keeps only the token's hash); "the Scan button
   covering" turned out to be Scan's own camera button in landscape (`docs/journal.md`).*
3. [x] **Split the Profile page into sections** (Profiles / Account / Admin). New.
   *Done: `5749fca`, deployed Oct 26 in `5b3d4c3`.*
4. [x] **Visual pass, time-boxed:** cards not bullets, one button style.
   *Done: `619cda7`–`801ac67`, deployed Oct 26 in `5b3d4c3`.*
- [ ] **"Scan another product", one tap from a result** (JT, Oct 29). New. Pinned just above the
  tab bar whenever a result is on screen: a card, the sample's, a label photo's, or "couldn't read
  this label". It's hidden over an open report form, in the required-photo state, and while the
  camera or its sentence is up. The tap takes the same path as "Scan with camera". The Scan tab is
  unchanged.
  The same at every width, with a fade above the strip (JT, Oct 29, after the pinned strip cut
  "Report a problem" in half on a 1280×800 laptop window on production).
  *Built Oct 29 in `f8c18f2`, the fade in `fcdbe97`, not deployed. After the deploy, check on a phone: a scan, then
  "Scan another product" from the foot of the card starts the camera, and the 911 note and
  "Report a problem" scroll clear of the button.*

### Week of Nov 2 — medium risk, deploy the same week

5. [ ] **Decode only inside the scanner box,** behind `SCANNER_REGION` (off = today's full-frame
   read). Moved from "Deferred". `decodeFromVideoDevice` reads the whole frame with no region
   option, so this needs our own loop — copy the box's part of each frame into a small canvas and
   call `decodeFromCanvas` — replacing a camera path that works today. Test on 2+ phones before
   switching it on.
   *Built 2026-10-27 (`5c99f50`, `43d0724`), deployed off that day in `74ea011`. Decodes inside the
   box plus 5% (`REGION_ALLOWANCE`, to tune after the phone tests). An admin can turn it on for one
   phone from Profile → Admin before the switch goes on; rollback is `SCANNER_REGION=off` and a
   restart (`docs/server-setup.md` §11b).*
   *Phone 1 passed, 2026-10-27 about 12:00 ET: JT's iPhone, on production, with "Decode only inside
   the box, this device" On. Portrait and landscape alike: a barcode inside the box gave "Got it",
   then the result; a barcode beside the box didn't read, and the label-photo offer appeared at
   about 8 s. One real package read correctly inside the box.*
   *Switched on for everyone on production, 2026-10-27 about 12:23 ET: JT's decision after the one
   phone above passed, ahead of the "2+ phones" this item set. Checked by JT: the running process
   shows `SCANNER_REGION=on` (and `CIRCLE_ESCALATIONS=on`), health ok; with his phone set back to
   Server default, inside the box reads and beside it doesn't. Rollback: `SCANNER_REGION=off` and a
   restart (`docs/server-setup.md` §11b).*
   *Still owed before Nov 20: one Android phone, and a curved or small package. Not yet tried
   either: the same packages with the device choice Off.*
6. [x] **Approve/decline circle requests.** Moved from "Deferred". Today an invite is a link the
   invitee accepts, so the Circle tab lists only invites waiting to be accepted (JT, 2026-10-23); a
   request flow is a new feature. Plan first, checked against Prof. Yoest's conditions: the
   requester sees nothing until approved, and the owner is notified.
   *Planned 2026-10-27, parked until next week. JT's decisions:*
   - *Follow requests only. Co-managers still come only by invite link, so the reasoning in
     `CONTEST_RULES.md` §3a ("a co-manager was explicitly invited") stands unchanged.*
   - *No list of sent requests for the requester.*
   - *A declined request is kept 30 days, so a repeat request is silently dropped, then purged by
     the retention job.*
   - *Prof. Yoest hears about it before it's switched on.* Changed 2026-10-27 (JT): switched on
     that day, and Prof. Yoest hears about it in the next email instead (`docs/approvals/conditions.md`,
     "Other open asks").
   - *Ships dark behind `CIRCLE_REQUESTS`, off by default.*

   *The plan: a request goes to an adult's account by the exact email address the requester
   already knows, never to a profile; no search or listing. The response is identical whatever the
   address, and the requester sees nothing (no name, profile, allergen, scan or status) until the
   owner approves. Only the owner decides, choosing one of their own profiles and a share level; an
   in-app notice after Condition 2's, and a Circle tab badge, stay until Approve or Decline. Rate
   limited per requester, per IP and per owner. No message field; the request row keeps requester,
   owner, status and timestamps only, deleted on approval. Invite links unchanged.*
   *Built 2026-10-27 (`d382698`, `455e384`), deployed off that day in `64803a0`. The principles row
   is in (request cards show the requester's email because the form says so; the typed address is
   never stored). Switch on and off: `docs/server-setup.md` §11c.*
   *Switched on in production, 2026-10-27, and checked about 12:33 ET with `CIRCLE_REQUESTS=on`, on
   JT's two test accounts. Timmy asking James wrote no row, as designed: Timmy already sees every
   profile James owns. James asking Timmy: Timmy saw the request line on Scan, after Condition 2's
   notices, and the Circle badge, and approved it at full profile; James now follows Timmy's
   profile.*
   *Done: mentioned to Prof. Yoest in JT's reply of the evening of Oct 27
   (`docs/approvals/2026-10-27-jt-judges-reporter-row.md`).*

### Week of Nov 9 — highest risk

7. [x] **Conversational sign-up,** behind its own setting. New. The chat only suggests; its
   suggestions map onto pick-list keys; the parent confirms on a normal screen; the AI never
   writes directly; and it falls back to the pick-list if the AI is down. Off for judging if not
   solid.
   *Changed direction 2026-10-27 (JT): a guided, chat-style setup with tap-to-answer options, no
   AI. The AI food list built first that day is kept, unmerged, on the branch `item7-ai-food-box`.
   Built: `a2aad93` (the `GUIDED_SETUP` switch), `ad7fbc0` (the sample scan), `a83e165` (the
   sentence before first camera use), `3cdd913` (the guided setup). Off by default
   (`docs/server-setup.md` §11d).*
   *`GUIDED_SETUP` switched on in production 2026-10-27, about 17:55 ET, on `738781e`; JT's phone
   check of the guided setup passed. `738781e` also carries the sentence before first camera use,
   which isn't behind the switch.*
   *Item 7 now also covers sign-up and first visit: `6e38876` (the public `GET /api/features`),
   `2dd7f35` (the guided sign-up), `011448f` (the first-visit redirect), `1fdf455` (docs), and
   `4a27602` ("Add a profile" under the profiles you manage).*
   *Done: `c737cdf` deployed 2026-10-27, about 18:20 ET (release `20261027221004`; rollback target
   `20261027213148`, `738781e`), with a backup taken first, and `GUIDED_SETUP` already on. JT's phone
   test passed: a new synthetic account through all four sign-up steps into the guided setup, the
   progress bar continuing, and "Add a profile" under "Profiles you manage". Rollback is
   `GUIDED_SETUP=off` and a restart.*
   *Decided 2026-10-27 (JT): `GUIDED_SETUP` stays on through judging and after. It's the standard
   sign-up and add-profile flow from now on. The switch and the classic form stay in the code as
   the rollback (`docs/principles.md` principle 4); off is the emergency fallback, not a planned
   state (`docs/server-setup.md` §11d).*

### Nov 13 — code freeze

- [x] **Deploy the reporter row before the freeze** (Prof. Yoest's Oct 27 ask,
  `docs/approvals/2026-10-27-yoest-judges-reporter-row.md`): `255f867` (the seed) and `f91691a`
  (the `JUDGES.md` row), pushed Oct 27 in `cd97de2`. A deploy alone doesn't make the row true on
  production; the judging-week reseed below does.
  *Deployed Oct 29 in `154a6ba`, in its shared-barcode form (next item).*
- [x] **Deploy one shared barcode with judge worlds before the freeze** (Prof. Yoest's Oct 27,
  7:55 PM ask, `docs/approvals/2026-10-27-yoest-one-shared-barcode.md`): migration 0049 and the
  seed on `2990000000083` for every judge (`c32c3c0` … `f256065`, built Oct 29). Brings migration
  0049; a symlink rollback past it still works (`docs/server-setup.md` §9). After the deploy, run
  the false-safety check in `docs/server-setup.md` §8.
  *Deployed Oct 29, about 12:10 PM ET: `154a6ba`, release `20261029160944`, migration 0049
  applied, backup taken first. The false-safety check passed: James's peanut profile on `…076`
  still "Contains an allergen", reported by 2 shoppers. Takes effect on production at the
  judging-week reseed.*

Fixes only from here.

### Week of Nov 16 — judges

- [ ] `--rotate-passwords` reseed, in JT's own terminal. This is also the reseed that makes the
  reporter row true on production, and that puts every seeded account in its judge world. Check it
  as judge1 and judge2 on the shared barcode (`2990000000083`): Maya names "Priya Nair
  (co-manager)", Noor says "A co-manager in Noor's circle", and both say no other family has
  confirmed it. Then the false-safety check (`docs/server-setup.md` §8) once more.
- [ ] judge1 shows no banner.
- [ ] Tick the judge item and fix the `JUDGE_PASSWORD` line.
- [ ] Four one-time links.
- [ ] Confirm the AI key works: Console "Last used", plus a label photo.

---

## Week 0 — Sept 8–14 · Setup and submission

- [x] Framework exception approved in writing by Prof. Yoest — save email to `docs/approvals/`
- [x] Public GitHub repo created, this README as first commit *[15%]*
- [x] AWS account created; **billing alerts before provisioning anything** (also one of the five
      onboarding tasks that raises free credits from $100 to $200)
      *Week of 2026-10-05:* the budget showed 0 of 1 email recipients verified, so the alert set up
      in September may not have reached anyone. JT fixed the recipient; the setup date stands.
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
- [x] **Deletion design, decided here not in week 9** — FK cascade shape decided and implemented
      for everything that exists so far (`allergen_profiles`, `allergens`, `profile_managers`,
      `follow_relationships`, `manager_invites` — see those migrations' comments for the
      CASCADE-vs-SET-NULL reasoning, verified empirically against real Postgres). `scans` and
      `product_corrections` finished their own cascade decisions as each table was built (weeks
      4–5 and 8, see those migrations); `product_corrections.scan_id` later changed from CASCADE
      to SET NULL (Week 9) so the corrections corpus survives the retention job. `DELETE /account`
      itself shipped in Week 9, with one addition beyond this design: a co-managed profile
      transfers to its longest-standing co-manager instead of being destroyed (`docs/coppa.md`
      §2.6)
- [x] Retention: scan history older than 24 months purged automatically, and the job actually runs
      *(`docs/coppa.md` §2.7 — an unenforced stated policy is worse than none)*. Runs in-process
      (no cron/systemd timer on this box) with a `retention_runs` audit row per run, success or
      failure, so "did it run" is a `psql` query, not a guess
- [x] Seed script: invented families, profiles, and circle members for the judge account *(R9)*.
      **Rerunnable** — wiping and re-seeding the judge data must be one command. The judge account
      can delete itself from the Settings page (Week 9), and re-creating demo data by hand during
      judging week is not a position to be in. Give at least one seeded profile a co-manager, so
      that profile transfers to them instead of being destroyed if the account is ever deleted.
      Done 2026-10-01: `npm run seed:judge -w server` locally, `node server/dist/db/seedJudge.js`
      on the box (`docs/server-setup.md` §16). Four accounts on the reserved
      `demo.circlebite.test` domain (signup refuses it); the judge owns Maya (co-managed by Priya,
      so she inherits it on deletion), co-manages Leo, follows Noor — every role, including the
      follower's escalate-only form. History spans all four verdicts from the real matcher, on GTINs
      with invalid check digits cached as seed products so rescans reproduce it; no AI calls. One
      corroborated community report on a seed barcode. Judge's own reports are rejected on reseed,
      not deleted. A guard refuses when a real person is attached to a seeded profile; `--force`
      removes only those rows. Judge is not an admin (Sept 11 precedent). Tests cover fresh seed,
      reseed, reseed after the judge deleted itself, non-seeded rows untouched, the guard, `--force`,
      and rescans reproducing history.

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
- [x] `extractLabel()` — photograph the ingredients panel, extract text via the Anthropic API (no
      hosted OCR service — R6), then the same reasoning path *(Path C. Downscaled client-side before
      upload, max 1568px longest edge; photo processed and discarded, never stored — only the
      extracted text and the call's own metadata persist, in a new `label_extractions` table. A
      photo-sourced read can never claim "safe": `mergeVerdict()` downgrades a would-be-safe verdict
      to `unable_to_confirm` when photo-sourced, same pattern as its existing AI-failure override;
      `complete`, separate from `legible`, catches the dangerous case — text that transcribes
      cleanly but was cut off before the "may contain" line. Kill switch `LABEL_SCAN`, off by
      default, same pattern as `COMMUNITY_CORRECTIONS`. `scans.barcode`/`product_corrections.barcode`
      are now nullable for the fully barcode-less entry point; such a correction still overrides the
      reporter's own view but never corroborates cross-profile. AI accuracy page gets a `bySource`
      breakdown so Path C's overrule rate can't silently mix with Path B's, since they share one
      prompt_version)*
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
against production, not just unit tests. Path A (AI-authored explanation only) remains future work;
Path D (reconciliation) is built now — see below, not yet deployed.

**Path D (the adaptive scan flow) built, not yet deployed** — full reasoning in
`docs/journal.md` 2026-09-27. One entry point instead of two: barcode always runs first,
`decideEvidenceNeeded()` then decides whether a label photo is required (barcode data missing or
thin), offered (a severe allergen on the profile, unless the barcode already says
`contains_allergen`), or unneeded. A combine step merges the label read into the SAME scan the
barcode produced (`scans.source` gains `'combined'`) rather than a second, disconnected record, so
a correction against it still corroborates cross-profile by barcode like any other barcode scan.
Per-allergen reconciliation decides whose finding wins when both sources speak: label silence can
escalate a database's clear allergen (`label_stricter`) but can never weaken a database's positive
finding (`label_looser` keeps the barcode's classification unchanged — a photo's silence can't
clear an allergen on its own, so by the same logic it can't be strong enough to weaken a different
source's finding either; the report link this row offers is grounded in the family's own reading of
the physical package, never in the photo's silence). A product-identity check blocks the merge —
verified genuinely dry against real Postgres, nothing partially written — until the family confirms
the photographed label is actually for the scanned barcode; tuned as the loosest defensible rule
against this project's own three real cached Open Food Facts names, not a numeric threshold guessed
at from invented ones.

**Consequence to know before judging:** for a profile with a severe allergen, the photo is now
offered on every scan that doesn't already come back `contains_allergen` — every `safe`, every
`may_contain_caution`, every missing/thin-data `unable_to_confirm`. Deliberate, not a bug — the
core user is a family managing a severe allergy, so this is closer to the common case than an edge
one — but worth knowing going into a demo.

- [x] `decideEvidenceNeeded()` — the barcode-first decision (`server/src/verdict/scanPlan.ts`)
- [x] `reconcileEvidence()` — per-allergen reconciliation; no new classification value added, the
      five-value union from Path C stands
- [x] `compareProductIdentity()` — the product-mismatch gate
- [x] `combineLabelScan()`/`confirmProductIdentity()` — the combine step and mismatch resolution
- [x] Client wired end to end (`Scan.tsx`) — card hierarchy is verdict and real findings first, a
      disagreement banner loud but subordinate to the verdict, prompts and provenance last;
      `evidence_decision.photo === "required"` skips the card entirely rather than showing a
      barcode-only answer that isn't the real one yet
- [ ] Browser-verify the three states that need a real Anthropic API key to reach — the mismatch
      screen, an actual `combined` verdict, and the disagreement banner itself. All three are
      covered by server-side tests against real Postgres with an injected fake AI layer, but none
      have been driven through the browser; this dev environment has no key configured
- [ ] Measure the actual distribution of `product_last_updated` across the cached `products` table
      before adding staleness as a third `decideEvidenceNeeded()` trigger (`docs/verdict-engine.md`
      names it, this build deliberately left it out) — the doc's ~12-month estimate is a guess, and
      if most cached records are already older than that, the trigger would fire on nearly every
      scan by accident, collapsing the adaptive flow into always-photo without anyone deciding that
- [ ] Cache label evidence per barcode so a product only ever needs photo-verifying once across
      every family, rather than re-prompting every family that scans it — the natural next trim on
      the prompt-frequency consequence above, needs its own corroboration/staleness design

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
      corrections across the app. *Superseded 2026-10-07: two families to add, three to remove,
      counted in families — `docs/principles.md`.*
- [x] **Corroborated additions reach other profiles** — a corroborated "this allergen is in here"
      report escalates that allergen to "contains" on any profile that has it (spelling and synonym
      differences handled by the matcher), labeled as a shopper report, never as label data. Behind
      the `COMMUNITY_CORRECTIONS` kill switch (off by default), with a per-report undo and a
      per-scan audit column — `docs/server-setup.md` §11. Verified end to end against the compiled
      server and real Postgres. **Removals deliberately don't propagate** — JT's call, precedent in
      `docs/principles.md`: signup is open, so three throwaway accounts could otherwise clear a
      warning for everyone.
- [x] Review queue page — browse corrections and reject one from the UI instead of SQL
      (`docs/server-setup.md` §11), admin-gated the same way as the AI accuracy page
      (`assertIsAdmin`, 404 not 403). Claims grouped by (barcode, allergen, direction)
      case-sensitively, matching `recordCorrection.ts`'s own corroboration bucket rather than
      `communityAdditions.ts`'s case-insensitive display grouping. *Superseded 2026-10-07: claims
      group on the same allergen key corroboration counts on (migration 0043).* Rejecting a corroborated
      `add_caution` report requires a reason and immediately stops it showing on other families'
      scans — including scans already in their history, not just new ones; rejecting
      `remove_caution` doesn't require one, since that direction still doesn't propagate at all.
      `rejected_by`/`rejected_at`/`rejection_reason` added as the audit trail the psql runbook
      never had. Reporter identity is hidden from the UI (stable per-claim pseudonyms, plus a
      same-circle warning when two live reporters share a profile) for the same identifiability
      reason the AI accuracy page is admin-only; rejector identity is shown in full, since that's
      admin accountability rather than a user's health data — new precedent row in
      `docs/principles.md`. Still open, not done here: the reverse "warning survives" gap in
      `recordCorrection.ts` and letting corroborated removals actually reach other profiles — see
      `docs/journal.md`.
- [x] Fix the case-sensitivity mismatch between the corroboration bucket and the family-facing
      display: `communityAdditions.ts:31` groups by `lower(allergen)`, but `recordCorrection.ts`'s
      threshold query (`allergen = $2`) and migration 0015's unique index are both exact-match. Two
      reports spelled "Sesame" and "sesame" are the same claim to families reading the count, but
      two independent corroboration buckets to the engine deciding whether either one has actually
      corroborated. Fail-safe in both directions today, so this is a consistency bug, not a safety
      one — `add_caution` corroborates at a threshold of 1 regardless of which bucket a given report
      lands in, and a `remove_caution` split across two spellings never reaches 3 in either bucket,
      so the warning survives either way. If this is ever reconciled, the write-side (exact-match)
      bucket should win, not the display-side one — it's what actually decides `status`, and
      loosening it to match the display query would let two differently-spelled reports corroborate
      an allergen removal that neither reporter alone had cleared the threshold for. Found while
      building the review queue (2026-09-20 journal entry); not blocking anything, not fixed there.
      **Done 2026-10-07, migration 0043** — when the two-family threshold made it a safety bug rather
      than a consistency one: two differently-spelled families could report the same allergen and no
      warning would spread. Corroboration, the review queue and the family-facing count now all group
      on one stored key. The warning above about removals is kept: removals count on a spelling-only
      key ("Milk", "milk", "Milks"), never synonym clusters, so a removal still can't add up from
      reports of different things.
- [x] Correction form fixes from the 2026-10-01 production logs. Correction photos are downscaled
      client-side to 2048px before upload. A duplicate report is a 409 `already_reported` with its
      own copy, not a 500 and "try again". Rejected reports no longer count toward corroboration. A
      rejection no longer locks the reporter out of that claim: they can re-file (migration 0034),
      the form tells them the earlier report was reviewed and not accepted, and the re-file is held
      out of corroboration until an admin accepts it from the review queue (migration 0035) —
      `docs/principles.md`, Oct 1 2026 precedent.
- [ ] An optional, reporter-facing note an admin can write when rejecting — separate from
      `rejection_reason`, which stays audit-only. Today a re-filer only learns their report "was
      reviewed and not accepted", not what was wrong with it, so they can re-file blind.
- [ ] Decide whether re-filing needs a cap (e.g. refused after two rejections of the same claim).
      Depends on the note above: a reporter who's told why is much less likely to re-file the same
      evidence, so build the note first and see whether the queue still fills before adding a cap.
      Every re-file today costs the reporter a new photo and reaches nobody until an admin acts.
- [x] A correction filed against a mismatched-label scan (`identity_mismatch_at_report`, migration
      0032) never corroborated itself, but still counted as a reporter when *someone else's* report
      ran the threshold, and was flipped to `corroborated` with the claim. Both halves now excluded
      in `corroborateClaimIfThresholdMet`. Found and fixed 2026-10-01.
- [x] AI accuracy page — overrule rate overall, by allergen, and by model/prompt version, scoped to
      `target = 'ai_verdict' AND direction = 'remove_caution'` (the false-alarm sense of "overrule"),
      with unresolved escalations counted separately from contains/caution ones. Reported misses and
      AI call failures get their own counts rather than being folded into the rate — the page states
      outright that the overrule rate can't see misses. Rates are withheld (raw counts always shown)
      below 20 escalations/attempts. Gated behind a new `users.is_admin` flag, not the judge account
      (`docs/principles.md`) — no UI sets it, flipped by hand per `docs/server-setup.md` §12.
- [x] Self-initiated NPS feedback in Settings — never a modal, since the scan path is a safety flow.
      `nps_responses` migration, one response per user per 90 days (409 on a repeat, checked in
      application code), promoter/passive/detractor derived at read time. `/admin/nps` mirrors
      `/admin/ai-accuracy` exactly (`assertIsAdmin`, same small-n suppression), kept deliberately
      minimal — score, counts, and verbatim reasons only — as the approved, narrow exception to
      §7's "admin analytics beyond the AI accuracy report" freeze (`CONTEST_RULES.md` §7, dated
      Sept 25, 2026). Invented responses keep the page from being empty during judging — first a
      standalone NPS-only seed, folded into the judge seed script on Oct 1 (one command, same 24
      rows, `source = 'seed'`).

## Week 9 — Nov 10–16 · Polish and hardening *[10% UX, 15% code quality]*

JT's own read, 2026-09-28, after using the app on a phone in a real session: the UI and UX are
the weakest part of the project. That matches the rubric risk — 10% of the grade sits here and
it is the least-worked area. Treat this whole section as the priority block it is.

- [ ] **Four small findings from the 2026-10-01 live session, none of them tracked elsewhere.**
      - **A sentence ending in a comma before a button.** The verdict card reads "This profile has a
        severe allergen on file — for extra confidence," and then a "Photograph the ingredients
        label" button is used as the end of the sentence. It doesn't read as one thing, and a screen
        reader gets a fragment followed by an unconnected button label. Seen on the app's most
        important screen in three separate captures.
        *Done 2026-10-28 (`3a532a3`): "This profile has a severe allergen on file. A photo of the
        ingredients label is an extra check." The other three findings here are still open.*
      - **The rejection-reason field sits between Reject and Accept** in the review queue, so it
        reads as applying to either. A reason typed before pressing Accept is silently discarded. It
        belongs to Reject alone — move it under that button, or reveal it only once Reject is
        pressed.
      - **The admin's real email shows as the rejecter** in the review queue ("Rejected by" and the
        admin account's real address). A judge logged in as admin sees it, and R9 wants synthetic data
        in anything a judge can reach. Either the seeded demo admin does the rejecting in judge data,
        or the queue shows a display name rather than an address.
      - **"Safe" is built inside composed sentences, not just the two label maps.** The card renders
        "The product data alone says Safe." separately from `Scan.tsx`'s and `ScanHistory.tsx`'s
        `safe: "Safe"` entries. The rename below is a sweep for every place the verdict word is
        produced, not a two-line change, and a grep for the literal won't find all of it.
- [x] **Scan history repeats itself, and the no-data card says one thing four times.** Both found
      live 2026-10-05, both copy rather than logic, both on screens a judge will open.
      - Every community-escalated entry in scan history repeats its whole explanation block — the
        unchecked note, the "originally Unable to confirm — changed because of" block, the reporter
        line. Three entries already fill a screen; twenty would be unreadable. History is a list, so
        each row should carry the verdict and what changed it, with the reasoning behind a
        disclosure.
      - The no-data verdict card now states "there's no product data" four times: the explanation
        line, the unchecked note, the photo offer, and the "product data alone says" block. Each is
        individually justified and together it's the three-second-read problem already fixed twice
        (2026-09-28, 2026-10-01). Say it once, in the place that earns it.
      *Done 2026-10-28, from the UI audit of that day.*
      - *History: `2b43999`. Each entry is the verdict word in its color, the product, the date,
        the allergen rows, and a line each for what changed it and what wasn't checked; the
        reasoning is in a closed "Details". Uncertainty stays outside it ("not yet confirmed",
        "Not checked: sesame"). Dates without seconds: `920be4d`.*
      - *No-data card: `2fd92f3`. The explanation keeps the claim; the unchecked note names
        sesame without repeating why, and the photo offer says only what the photo is for. The
        rows and the "product data alone says … Changed by …" block are unchanged. `JUDGES.md`
        updated in `7f7331e`.*
- [ ] **An allergen added to a profile after a scan doesn't appear on that scan's history card.**
      The 2026-10-05 fix covers scans that checked nothing; this is the case where the scan *did*
      have product data and the profile changed afterwards. Same "rows are the contract" problem,
      history only. The honest fix is probably not to grow the rows retroactively but to say what a
      history card is — "this scan checked Maya's allergens as they stood on 3 October" — since the
      card is a record of what was checked then, not a decision anyone is making now.
- [ ] **The "Changes to review" banner doesn't say whether it means a person or a profile.** Seen
      verifying the 2026-10-08 production deploy: "Timmy changed James Mazza's profile — 2 updates
      you haven't reviewed." Timmy is the co-manager's account name, and also the name of a profile
      that account owns, so the sentence doesn't say which one is meant. The history entries on the
      profile page already make it clear ("timmy (co-manager) removed Ownertest"). The banner drops
      the role. Carry the role into the banner the way `entryActor` does. Also make the casing match:
      `unseenActors` (`client/src/lib/profileChangeCopy.ts`) capitalizes the first letter of the
      joined names, so the account "timmy" shows as "Timmy" in the banner and "timmy" in the
      history. This matters more in the banner than in the history: the banner is read by someone who
      wasn't looking for it, while someone reading the history already went looking.
      Lower priority than the seeded "Someone outside the app" banner (JT, 2026-10-08): that one is
      on every judge's first screen after login, while this one needs a real co-manager edit. That
      one is fixed in `1818677` and reaches production with the reseed under the Nov 16 credentials
      item.
- [ ] **A change with no recorded actor is shown as made by "someone outside the app".** Not now
      (JT, 2026-10-08). `1818677` fixed the seed, which was the source seen in production. But the
      banner (`unseenActors`) and the history entry (`entryActor`), both in
      `client/src/lib/profileChangeCopy.ts`, still turn `actor_id IS NULL` into a claim about who
      acted. "Someone outside the app" asserts something the row doesn't record. Any future write
      outside `withActor` produces the same alarming sentence on an owner's dashboard. **It is
      already false in production use, not only in theory.** `release.sh` migrates before it swaps
      the symlink, so for a few seconds on every deploy since 0036 the previous release is still
      serving. An edit a parent makes in the app in that window is recorded with no actor, as
      migration 0036 itself documents, and the owner is then told someone outside the app made it.
      The label is wrong in that case by construction. What the row actually
      supports: the change was recorded without saying who made it. Reword both places to say
      that, and the comments that repeat "made outside the app" (`acks.ts`, `history.ts`,
      `api.ts`, `withActor.ts`, migration 0036, `docs/architecture.md`). Keep the entry in the
      banner, since an unattributed change is still one the owner should see. Only the claim about
      who changes.
      Same shape as the corroboration count and the `076` "not on file" message: a check that can't
      tell unknown from no, resolving to the scarier answer. One difference to keep: on a verdict,
      principle 1 makes the cautious answer the right one when data is missing. Here nothing about
      safety rests on the wording, so an alarming claim buys nothing.
- [x] **A failed product lookup is shown as "We don't have this barcode on file", and cached for a
      day.** *Done 2026-10-28 (`898c7bb`), as sized below, with one refinement (JT): when a refresh
      fails, only a stale row that **found** the product is served; a stale not-found row gives
      "failed", since its answer is as old as the row and may itself have been a cached failure.
      Principle 2's line updated in `7340eb4`.* Found 2026-10-08. `fetchProduct` (`server/src/lib/openFoodFacts.ts`) collapses a
      network error, timeout, non-2xx or bad JSON into the same `NOT_FOUND` as a genuine not-found.
      `getProduct` caches it for `CACHE_TTL_MS` (24 h), and `explainMissingProductData` then tells the
      parent the barcode isn't on file. The verdict, Unable to confirm, is right (principle 1). The
      sentence states a fact about the product database that nobody checked. Keep failing closed,
      but keep "lookup failed" distinct from "not found": say the lookup didn't complete, and don't
      cache a failure as a not-found. Principle 2's "Where it decided things" line ("distinguishes
      barcode unknown from no ingredient data") is true only for genuine not-founds until this is
      fixed.
      **Do before Nov 16 (JT, 2026-10-08; was Nov 23 until judging moved to Nov 20).** During
      judging, a slow or erroring Open Food Facts
      would tell a judge the barcode isn't on file for 24 hours, with nothing suggesting a retry, so
      it reads as the app being broken. In real use, one transient failure hides a product's data
      for a day. Worse than the first description: once a real product's row passes the TTL, a
      failed refresh **overwrites good cached data** with not-found.
      *Sized 2026-10-08: small, about half a day with tests.*
      - `openFoodFacts.ts`: split the failure path from `NOT_FOUND`. A lookup result says "found",
        "not found" or "failed", and timeout, network error, 5xx and bad JSON are "failed".
      - `productLookup.ts`: never write a failed result to `products`. If a cached row exists, even
        one past the TTL, serve it, since stale data beats none. Otherwise return the failure.
      - `explainVerdict.ts`: a third sentence for "failed", saying the product database couldn't be
        reached and to try again in a moment. The verdict stays Unable to confirm.
      - Callers: `routes/scans.ts` passes the result through. `labelScan.ts` only checks
        `hasUsableData`, unchanged. Scan history doesn't re-derive this sentence (only the live
        response carries it), so no history change.
      - Tests: `productLookup.test.ts` already stubs `fetch`. Add a timeout that leaves no cache
        row, a failed refresh that keeps the old row, and a not-found that is still cached.
      - **The one thing to check against the real API first:** how Open Food Facts answers an
        unknown barcode. Today `!res.ok` counts as not-found. If unknown barcodes come back as HTTP
        404, a 404 must stay "not found", or every scan of an unknown barcode would call Open Food
        Facts again and never cache. Confirm the status for a known-unknown barcode before writing
        the branch, rather than assuming it.
        *Checked 2026-10-08 16:51 UTC*, with the app's own request (same URL, `fields`, and
        `OFF_USER_AGENT` format) for `2990000000076`:
        `HTTP/2 404`, `content-type: application/json; charset=utf-8`, body
        `{"code":"2990000000076","status":0,"status_verbose":"product not found"}`.
        So an unknown barcode is a 404 with a JSON body. Treat 404 as "not found", and read the
        body's `status: 0` to confirm it, rather than counting every non-2xx as a failure. Not
        checked: whether a barcode with a *valid* check digit that OFF doesn't know answers the
        same way. This one's check digit is deliberately invalid.
- [ ] **A pending escalation stays with the person who filed it, on the one scan they filed it
      from.** Found 2026-10-13. `loadUserScanViews` (`server/src/corrections/userScanView.ts`)
      applies uncorroborated corrections only `WHERE scan_id = ANY($1) AND reported_by = $2`. So
      within one circle, a co-manager's report that an allergen is present is invisible to the owner
      and the other managers, and the reporter loses it on their own next scan of that barcode.
      **Product decision, JT, 2026-10-13:** share pending escalations across a profile's managers
      and persist them across scans of that barcode, while pending removals stay with the reporter,
      on that scan, until corroborated. **Widened 2026-10-16 (JT): anyone who can view the
      profile, followers included,** not only its managers. A follower is the babysitter standing
      in the aisle holding the package; if a co-manager has photographed a label showing peanut,
      that is exactly who needs to see it. A severe_only follower's history still never names a
      mild allergen's report (`routes/scansHistory.test.ts`). Warnings spread, clearings don't (principle 1). The README
      described it this way before the code did: both corroboration rules said "the reporting
      family's own view". They were reworded to match the code on 2026-10-13 (`b26f3b9`) and go
      back to family wording when this ships. Not for tonight; not yet sized.
      **Built 2026-10-16, off by default** (`CIRCLE_ESCALATIONS`, `docs/server-setup.md` §11a):
      migration 0045 records the profile each report was filed from; `circleEscalations.ts` shares
      pending additions with everyone who can read that one profile (not a sibling's — JT,
      2026-10-16), in history and on all four live card paths; the allergen row says "reported in
      your circle, not yet confirmed", and a lighter line under the card names who reported it and
      that they photographed the label (JT's cut after reading the rendered card, 2026-10-16).
      - [ ] **Look at the card locally first, at phone width** (JT, 2026-10-16). `seed:judge`,
        then `seed:circle-demo` (Priya, Maya's co-manager, reports Peanut on Oat Biscuits
        `2990000000038`), `CIRCLE_ESCALATIONS=on`, sign in as judge1.
      - [ ] **Deploy, verify, then switch on.** Not over a weekend (JT, 2026-10-16). On
        production: as a co-manager, report an allergen present; as the owner, see it on that scan
        and on a fresh scan of the barcode; check a sibling profile and another family's do not.
        *As of 2026-10-17:* production is on `372dd6e` (Oct 8). It has `1818677` (seeded history
        recorded as the owner's) and migrations through 0044, and not `e6f96c9` (this feature). The
        next deploy ships everything since — 33 commits as of `0903bcf`, including migration 0045,
        per-judge passwords and the "check couldn't finish" card. Sequence:
        1. Check `~/circlebite/.env` doesn't already set `CIRCLE_ESCALATIONS=on`, then deploy (§8).
        2. Production check with the switch off: the app comes up, release.sh applied 0045, a plain
           barcode scan and a label photo both work, `journalctl` shows no `AI step failed`.
        3. Switch on (`docs/server-setup.md` §11a), then the circle check above.
      - [ ] **Then reword the README** back to family wording — both rules still say "the
        reporter's own view of the scan they filed it from", which stays true until the switch is
        on in production. Not before: that would be the README claiming more than production does.
      - [ ] **Record circle escalations on the scan row**, as `community_corrections_applied`
        does for community reports, so the audit trail says what a card showed at scan time.
        Today the live card shows them and nothing records it.
      - [ ] **An escalation never reaches the owner's history or banner**, with `CIRCLE_ESCALATIONS`
        on or off. Only `remove_caution` writes a `profile_changes` entry (migration 0037's
        trigger), and the banner counts only those (`acks.ts`). With the switch on, the owner sees a
        co-manager's pending warning on the card, but nothing tells them one was filed. Open
        question (JT): raise it with Prof. Yoest? His Condition 2 names downgrades only
        (`docs/approvals/conditions.md`, Condition 2's scope note).
- [ ] **A test that fails when a doc states a corroboration threshold the code doesn't.** Found
      2026-10-13. Six times in two weeks a doc claimed more than the code: the README's owner-only
      downgrade line, "1 to add" in `docs/principles.md`, the review-queue comment, the
      `docs/legacy-spec.md` scope clause, and the family-reach wording in both `principles.md` and
      the code comments. Each was caught by someone reading carefully at the right moment. Narrow
      version only: read `CORROBORATION_THRESHOLD` (`server/src/corrections/recordCorrection.ts`)
      and assert the README and `principles.md` state the same numbers. It won't catch prose; it
      catches a number in a doc outliving the constant it describes, the class that has bitten most.
      *Sized 2026-10-13: small, about two hours with the doc edits. Not built.*
      - Anchor on the canonical sentences, not every number. `principles.md` keeps history on
        purpose ("one report until Oct 7, 2026", "Supersedes '1 to add, 3 to remove'"), so "no
        other number appears" would fail on correct text. Match the "Where it decided things" line
        (`two families to *add* … three to *remove*`, line 39) and the decisions-table row
        (`thresholds 2 to add, 3 to remove`, line 124), and the README's bold rule (`once two
        families have reported it`, line 34). Map the words one–five to digits.
      - The README states only the add threshold. Either assert just that, or add the removal
        number to the README first. That's a wording decision for JT, not the test's.
      - A missing anchor fails too, so rewording a sentence can't silently switch the check off;
        the failure message names the file and the pattern it looked for.
      - Lives in `server/src/corrections/`, runs under the existing `npm test` (`node --test`),
        reads the docs by paths resolved from `import.meta.url`. Importing `recordCorrection.ts`
        pulls in `env.ts`, which throws without `DATABASE_URL` and friends; the suite already runs
        with those set, so nothing changes, but the test can't run bare.
      - Later, same harness: the 911/disclaimer wording and "reporter's own view of that scan".
        Out of scope for the narrow version.
- [ ] **Ship migration 0044 in the deploy after 0043, never the same one.** 0043 adds the two
      allergen keys nullable; 0044 requires them. `release.sh` migrates before it swaps the symlink,
      so a constraint shipped with 0043 would be live against the old release for a few seconds, and
      a parent's report in that window would 500. Push up to the commit before 0044, deploy, confirm
      healthy, then push 0044 and deploy again. 0044 first fills any keys that window left missing,
      itself. It refuses only if a row is still unkeyed after that — unexpected, so find out why
      rather than forcing it. A refusal aborts release.sh before the symlink swap (checked
      2026-10-07), so the running release stays up.
- [ ] **A held removal waits on someone working the review queue.** A removal blocked by a
      confirmed warning stays pending, and its parent is told "a reviewer sees both" — true while JT
      reviews daily through judging, but a promise with no timer behind it if this ever runs
      unattended. Before that: an age on held claims in the queue, or an alert when one sits too long.
      Not now (JT, 2026-10-08).
- [ ] **Invert legacy-spec.md's scope clause.** §7 says everything it doesn't list as a difference
      is in scope — a denylist kept by hand, which went stale on corrections (fixed 2026-10-08) and
      will again. Invert it: nothing in `docs/legacy-spec.md` binds unless restated in
      `docs/principles.md` or `docs/verdict-engine.md`. Needs a pass first confirming those two cover
      what legacy-spec's remaining sections still require, so nothing in force is dropped by the
      inversion. Not this week (JT, 2026-10-08); the header note added the same day covers it until then.
- [ ] **Allergen hierarchy for corroboration.** Walnut is a tree nut, so a "contains walnut" report
      should count toward a tree-nut warning claim — but not the reverse, since "contains tree nuts"
      doesn't say which nut. That's a hierarchy, not a synonym cluster, and neither allergen key
      (migration 0043) can express it: today "Walnut" and "Tree nuts" are separate claims in both
      directions. Not for now (JT, 2026-10-07).
      - *Observed on production, 2026-10-16, just before 7:15 PM ET — a different problem, on the
        card:* a barcode scan of a chewy bar, by Timmy (co-manager) on James Mazza's profile, missed
        almonds under the profile's tree-nut allergen, which displays as "treenuts". Peanut on the
        same card read "listed on the product record", so it most likely took Path A (tagged
        product). **Not yet traced.** Two hypotheses, neither checked: (a) Path A matches only the
        product's allergen tags, and the record's tags may lack tree nuts even if almonds are in the
        ingredients; (b) "treenuts", one word, may not map to the tree-nut family — the matcher's
        aliases are "tree nut"/"tree nuts" (`synonyms.ts:59`) — the same class as the Peanut/peanut
        bug. The barcode is in the production `scans` table. The keyword list itself isn't the
        cause: almond/almonds are under tree nuts in `372dd6e` and now.
        **Traced 2026-10-23: both hypotheses were real.** Production's record for barcode
        096619160761 lists ALMONDS and ALMOND BUTTER in the ingredients, and "treenuts" came back
        clear — (b). It is also tagged "nuts" in allergens and traces, which no cluster matched — (a).
        Fixed by the allergen pick-list (migration 0046, `matcher/allergenChoices.ts`) and the "nuts"
        tag (`synonyms.ts`); tests on that exact record in `allergenChoices.test.ts` and `match.test.ts`.
        The hierarchy item above is still open.
- [ ] **Prof. Yoest's Oct 1-2 conditions on the overrule widening.**
      `docs/approvals/2026-10-02-yoest-overrule-conditions.md`. He approved owner-or-co-manager
      downgrades — "your reading is better than my wording" — and attached two conditions, a judge
      account, and an operational note. The cross-family sentence is answered (README, 2026-10-05);
      the judge seed itself is built and verified. What's left:
      - [x] **Log every downgrade — who, when, and what evidence.** `product_corrections` already
        stores `reported_by`, `created_at` and a required photo, so most of the data exists. What
        doesn't exist is a surface where a parent can *read* their profile's downgrade history.
        Build the reading surface, and check the row isn't missing anything he'd expect — the
        evidence photo and the accepted/rejected outcome in particular.
        **Built 2026-10-06** (profile change history, migrations 0036–0039). **Verified on
        production 2026-10-08 for profile edits only:** an owner's add and severity change, and a
        co-manager's severity change and removal, each logged with who and when, attributed
        correctly from both sides. Screenshot sent to Prof. Yoest that day:
        `docs/approvals/circlebite-downgrade-history-2026-10-08.jpg`. **Downgrade reports
        (`downgrade_reported`, migration 0037), the only entries that carry evidence, are verified
        by tests only.** No report was filed on production: the form requires a label photo, and JT
        stopped rather than upload a stand-in. Closes on the follow-up below.
      - [ ] **Notify the owner when a co-manager downgrades — a new subsystem, not a feature.**
        There is no notification mechanism in the server at all: no mail dependency (the five
        deps are express, pg, multer, cookie-parser, dotenv), no notifications table, and circle
        invites are single-use links the parent shares by hand (migration 0008). Email also sits
        badly with R6 — every hosted sender is a hosted service, and self-hosted mail from EC2 is
        blocked on port 25 by default and lands in spam. Plan an in-app notice (notifications
        table, unread indicator, a list the owner can read), and tell him that's the route and why
        rather than letting him assume email. Design against his standard, which is the right one:
        "the owner should never learn about a change to their child's profile by accident."
        **Built 2026-10-06** as an in-app notice (acknowledgements, migration 0040). **Verified on
        production 2026-10-08 for profile edits only:** after a co-manager changed and then removed
        an allergen, the owner's dashboard showed "Changes to review", two updates flagged New, with
        an "I've seen these" control. Not shown in the screenshot above, which is the owner's own
        edits. **The notice for a co-manager's downgrade report is verified by tests only.** Closes
        on the follow-up below.
      - [x] **File one downgrade report as a co-manager on production, and check the owner's
        notice.** Use a real photo of a real label, not a stand-in. Check the owner sees the
        `downgrade_reported` entry with who, when, the note and the photo, and that it appears under
        "Changes to review". Then record it in `docs/approvals/conditions.md`. This also exercises
        the `allergen_fold_key`/`allergen_family_key` columns under migration 0044's NOT NULL, which
        nothing live has written since that deploy.
        *2026-10-16, 7:15 PM ET:* the report filed on production was an **escalation** —
        `flag_missing` → `add_caution`, "treenuts" — not this. Still open. A downgrade is `flag_wrong`
        or `wrong_product` → `remove_caution`. The owner should see a `downgrade_reported` entry
        naming the co-manager, the time, the note and the label photo, and the "Changes to review"
        banner counting it, with only the owner able to acknowledge. That escalation did write a
        `product_corrections` row, so 0044's keys have had one live write — an `add_caution` one;
        a `remove_caution` write still hasn't happened.
        **Done 2026-10-23, 2:22:08 PM ET**, after deploying `82d6c76`: co-manager `timmy` filed
        `flag_wrong` on Sesame, on James Mazza's profile, against the synthetic seed Oat Biscuits
        (2990000000038, sesame trace on the record). Not a real label, unlike what this item asked:
        a printed one marked "TEST LABEL — synthetic product", because no real product checked had a
        card flagging an allergen its label doesn't list. The owner's history shows the entry with
        who, when, the verdict at the time, the note and the photo link, and the banner counts it
        ("disputed a scan warning — 3 updates"). Screenshots and the record:
        `docs/approvals/conditions.md`, Conditions 1 and 2. Only-the-owner-can-acknowledge was not
        exercised on production; it rests on `profileChanges.test.ts`. This was 0044's first live
        `remove_caution` write.
      - [x] **Automated Postgres backups.** His operational note, and he's right that it belongs
        before real circles depend on the data — Postgres is on the same box as the app, so losing
        the box currently loses everything. `pg_dump` on a timer with off-box storage; decide where
        off-box lives without breaking R5/R6, and **test a restore** rather than assuming the dump
        works. An untested backup is a belief, not a backup.
        **Done 2026-10-05 — closes item 4 of his Oct 1 conditions.** Running on the box: nightly
        dump + correction-photo tarball at 03:30 ET, copied to a private versioned S3 bucket via a
        PutObject-only instance role; weekly restore test into a scratch database. First restore
        PASSED (35 migrations, 3 photos referenced, all 3 present), `backup-status.sh` OK on all
        three lines, and the S3 copy verified byte-identical from the Mac. Runbook:
        `docs/server-setup.md` §17.
      - [ ] **Orphaned correction photos — 5 of the 8 files in `UPLOAD_DIR` are referenced by no
        row.** `product_corrections` references 3 photos; the directory holds 8. At ~3.5 MB each the
        5 orphans are ~17.5 MB of the current 28 MB, and they ride in every nightly tarball (7 local
        sets, up to 42 days of S3 copies). Checked against the code before writing this
        (2026-10-05), and it is **not** rejections: rejecting a report is an `UPDATE ... SET status
        = 'rejected'` (`reviewQueue.ts`, and the judge seed's own path) — the row and its
        `photo_path` stay, so rejected reports are among the 3 referenced. Nothing in the app
        deletes a correction row today, and since migration 0020 (Sept 16) deleting a scan, profile
        or account nulls `scan_id`/`reported_by` instead of removing it. The judge seed's one
        `DELETE` (its own fixed-id report) rewrites the same fixed path, so it leaves nothing
        behind.
        The orphans come from two windows that are already closed:
        - **Sept 10–16:** `scan_id` was `ON DELETE CASCADE` (migration 0015) — deleting a scan,
          profile or account deleted its correction rows and left their files.
        - **Sept 10 – Oct 1:** the photo is written before the row, and until `1a6a638` (Oct 1)
          nothing removed it when recording failed — a duplicate report hit the unique index as a
          500 and kept its photo. Since then a failed report deletes its own photo.

        Today the only way to create a new orphan is the process dying between the file write and
        the insert. So this is a fixed ~17.5 MB, not a growth driver: removing it buys headroom
        once, while §17.9's threshold (~100 MB of photos, ~28 at 3.5 MB) is reached by real
        reports.
        First step, read-only on the box — list each orphan with its timestamp, which says which
        window it came from:
        ```bash
        DB="$(grep DATABASE_URL ~/circlebite/.env | cut -d= -f2-)"
        comm -13 <(psql "$DB" -XAtc "SELECT DISTINCT photo_path FROM product_corrections" | sort) \
                 <(cd ~/circlebite/uploads && find corrections -type f | sort) \
          | while read -r f; do stat -c '%y  %s bytes  %n' ~/circlebite/uploads/"$f"; done
        ```
        Then decide: these are photos for reports that were never recorded or whose rows were
        deleted, so no review, overrule log or app path can reach them — deleting them loses no
        evidence. Delete by hand only after the listing, and note that copies stay in backups for up
        to 42 days (`docs/coppa.md` §2.6). Not urgent; worth doing before judging so the tarball is
        what it claims to be.
      - [x] **Send the judge credentials to Prof. Yoest and Matthew.** The seed is built and
        verified on production, and delivery is done (2026-10-05, below). One-time secret link,
        never plain email (the Week 10-11 item already says this). Confirm the seeded data
        contains both a rejected and a corroborated correction, so judges can see the overrule
        loop without having to create one themselves — that's the thing he said they'd need the
        account for.
        **Sent 2026-10-05**, to both, as a pwpush link set to expire after **two months or four
        views, whichever comes first** — around Dec 6 at the latest, sooner if the views are used.
        The account itself doesn't expire.
      - [ ] **Answer "define corroborated" by email.** His Oct 6 challenge
        (`2026-10-06-yoest-corroboration-challenge.md`) asked how many reports, from how many
        distinct families, before an escalation fires. Answered in the README on Oct 7 (`4e622f2`,
        two families) and never by email. Not in the Oct 19 email as drafted (JT, 2026-10-17). Open
        in `docs/approvals/conditions.md` too, which already says "Never answered to him by email".
      - [ ] **Send a fresh judge-credentials link on Monday of judging week (Nov 16).**
        Judging moved to Friday Nov 20 (Oct 14 email), so that Monday is now Nov 16, not Nov 23.
        Promised in
        the Oct 5 credentials email — this line is the only record of it outside that sent email.
        The first link can run out of views before it runs out of time, and judging is
        when someone is most likely to open it again. Same terms: pwpush, never plain email. If the
        account has been reseeded with a new `JUDGE_PASSWORD` since, the new link carries that one.
        That email should also carry the two asks the Oct 5 email didn't: the invitation to
        register their own account, and the request to report only against the seeded
        `2990000000…` barcodes. See the "Judge credentials sent by one-time secret link" item in
        the judging-week checklist, which stays open until this email goes out.
        **Since 2026-10-07 the seed makes four judge accounts, `judge1@` … `judge4@`, one shared
        password** — the `judge@` login in the Oct 5 link stops working at the first production
        reseed after that change deploys. This email carries all four logins. Production was
        reseeded on 2026-10-08, and JT decided the same day that the logins wait for this email
        rather than going out early. Blocked by the item below.
      - [ ] **Four distinct judge passwords — blocks the Nov 16 credentials email.** JT,
        2026-10-08. `seedJudge.ts` sets one password for all four judges (it printed "Judge
        password (the same for all four)" on the 2026-10-08 production reseed, and `78771c2` says
        "one shared password"). That defeats the isolation four accounts exist for: judge 2 typing
        `judge1@` by mistake lands in judge 1's world on the first try. Fix before the email:
        - `seedJudge.ts` sets four distinct passwords, one per judge account, each generated or
          supplied without touching the command line, shell history or a file (R8).
        - `docs/server-setup.md` §16 exports a single `JUDGE_PASSWORD` and has to change with it.
        - The reseed before the Nov 16 email runs the fixed seed, and each judge's link carries only
          their own login.
        - That reseed also has to run from a release that includes `1818677`. Until then, every
          judge's first screen after login reads "Someone outside the app changed Maya's profile — 2
          updates you haven't reviewed" (found 2026-10-08 after the production reseed). The seed
          wrote its allergens with no actor. After the reseed, check that judge1's dashboard has no
          "Changes to review" banner.

        **The Oct 5 login is dead.** The 2026-10-08 reseed deleted `judge@demo.circlebite.test`, so
        anyone holding the Oct 5 link has no access until the Nov 16 link goes out.
      - [x] **Reply with screenshots** of "No listed allergens found" and the 911 referral once
        both are live on production. He named those as the two safety items judges look for, and
        asked for a screenshot of each. **Sent 2026-10-05** to Prof. Yoest, with both screenshots
        attached, in the same reply that answered his cross-family question and reported status on
        his two conditions.
- [x] **Prof. Yoest's two required changes — binding, promised in the README.** All built
      2026-10-01. `docs/approvals/2026-10-01-yoest-mvp-statement.md` approved the MVP statement
      *with two changes*, and that statement is already in the README promising them. He said the
      judges will look for this, and it is the ethical-AI bonus in his own words.
      - [x] **Downgrades are for the profile's managers** (dictated as owner-only; widened to owner
        or co-manager with his approval the same day). Any circle member may escalate (`add_caution`). Anything
        with direction `remove_caution` — `flag_wrong`, `wrong_product` — is reserved for the
        people who manage the profile: owner or co-manager, deliberately (`CONTEST_RULES.md` §3a,
        `docs/principles.md` Oct 1 precedent). Done 2026-10-01: a follower's removal is refused
        with 403 `removal_requires_manager` before the photo is written, with tests for follower,
        owner and co-manager; the report form only offers followers `flag_missing`. Production had
        no `remove_caution` rows at all when checked the morning of Oct 1, so nothing already
        filed needed reviewing. The per-reporter-role query for after the deploy hasn't been run
        yet — re-run it before judging to confirm no follower-filed removal slipped in.
      - [x] **The word "Safe" goes.** Done 2026-10-01. The clean verdict reads "No listed
        allergens found" on the live card and in scan history, from one `VERDICT_LABEL` in
        `client/src/lib/verdictCopy.ts` (it was duplicated in both pages); the `safe` enum value is
        unchanged. The three lead sentences that said "This hasn't been confirmed safe — …"
        (`explainVerdict.ts` ×2, `evidenceCopy.ts`) now open "Not confirmed — …", which supersedes
        the Sept 30 wording (`docs/principles.md`, Oct 1 precedent). Tests assert no verdict label
        or lead sentence contains "safe". Checked at 318px on a real clean scan: the headline wraps
        to three lines beside its icon, no horizontal overflow, no size change needed.
      - [x] **Emergency referral in the app.** Done 2026-10-01. "If anyone has an allergic
        reaction, call 911." in bold inside the disclaimer panel on every live verdict card, and
        the same panel once at the top of scan history, which had no disclaimer at all before.
- [ ] Model-written text that could one day say "safe". Checked 2026-10-01: none reaches a user
      today. The reasoning call's free-text `reason` per finding is copied onto `matched_allergens`
      by `mergeVerdict.ts` and **is in the JSON sent to the browser**, but the client's
      `MatchedAllergen` type doesn't declare it and nothing renders it. The label call's
      `incompleteReason` is stored in `label_extractions` and never sent. What *is* rendered —
      `citedSpan`, the extracted text, `contains`/`mayContain` — is verbatim label text (the span
      validator enforces it for `citedSpan`), so a "safe" there is the manufacturer's word, quoted.
      Before anything renders `reason`: add a prompt rule never to describe a product as safe, bump
      `PROMPT_VERSION` so the AI accuracy page keeps old and new apart, and add a test for a model
      response containing "safe". Worth also dropping `reason` from the client payload until then.
- [x] **Exercise the overrule loop on production.** Done 2026-09-29 — first real correction filed
      and worked through to rejected on the live site (`docs/journal.md`, same date; DB output in
      `docs/evidence/2026-09-29-correction-loop.txt`). Barcode 5690516025007 (Smjörvi, Icelandic): A
      scanned Safe → reported sesame missing with a photo → corroborated on 1 report; B (separate
      circle, profile John, sesame severe) scanned → "Contains an allergen", labeled as a shopper
      report, "product data alone says Safe"; rejected from `/admin/review-queue` with a reason → B's
      history back to Safe. Row `5abf43ca…`: `status=rejected`, `origin=user_initiated`,
      `identity_mismatch_at_report=f`, rejector + reason recorded; B's scan's
      `community_corrections_applied` names it, A's is `[]`. Reporter shown as "Reporter A". Not
      separately captured: the empty-reason disabled state and the confirm-dialog copy.
- [x] **Report confirmation overstates corroboration.** Done 2026-09-29. A corroborated
      `flag_missing` (add_caution, threshold 1) now says "Reported — this warning now shows for other
      families who scan this product." — only when the server's `reaches_other_families` says so;
      with COMMUNITY_CORRECTIONS off it says "this warning now shows on your own view" (principles
      precedent, same date). "Enough other reports agreed" is kept only for a corroborated
      removal (threshold 3), which adds that removals still change only the reporter's own view.
      Pending and barcode-less wording unchanged. Copy lives in `client/src/lib/correctionCopy.ts`
      with tests; this added the client's first `npm test` script (node:test + tsx, the server's
      convention). Found in the 2026-09-29 live test.
- [x] **Reporter's own live card doesn't change after reporting.** Done 2026-09-29. A's history
      already showed the corrected verdict ("Contains an allergen", with an "Originally Safe" callout
      naming A's report); only the live card was stale. History's per-scan sequence (own corrections,
      then community additions) moved into `corrections/userScanView.ts`, so no third rollup copy.
      `POST /scans/:scanId/corrections` now also returns the reporter's `effective`, `corrections` and
      `community_reports` from it, and the card headlines that. The engine's verdict stays in the
      callout with a "Your report: …" line shared with history. No new AI calls. Tested against real
      Postgres (`userScanView.test.ts`, `routes/corrections.test.ts`). Side fix: history showed a
      rejected report as "pending review". Follow-on decided from principle 1 (precedent row, same
      date): a rejected removal stops clearing the reporter's own view, and history says why; a
      rejected addition keeps warning them. Known gap: reporting and then photographing the label
      on the same card drops back to the photo's result on the live card (history is right).
      Found in the 2026-09-29 live test.
- [x] **Resolved claim's count contradicts its own list.** Done 2026-09-29. The count line now
      counts from `claim.reports`, which `reviewQueue.ts` already returned with every status: "1
      report — rejected", "N reports — all rejected", or "N reports, M still active — …". No new server
      field. Tests in `correctionCopy.test.ts`. Found in the 2026-09-29 live test.
- [x] **The verdict card's evidence header describes the code path, not the evidence.** Done
      2026-09-30 (`d81e455`, `f83a786`). `combineLabelScan` returns `evidence: "barcode_and_label" |
      "label_only"`, derived from whether the stored barcode side is empty (the contract
      `reconcileEvidence` already relies on); the explanation and the card's provenance line both read
      it. `COMBINED_SOME_UNCHECKED` deleted — "unchecked" only arises with no record behind it, so it
      could only fire when false. The generic unchecked sentence is dropped when the grouped note shows,
      which now leads with "This hasn't been confirmed safe". Not yet seen live — needs a key and a
      barcode with no product record. Original note: On a scan
      whose barcode returned no product record, the card still reads "Checked against the product
      database and a photographed label" — two lines below "Unknown product" (observed live
      2026-09-28, barcode 2113792886078). `scans.source` is correctly `combined`, since a barcode was
      entered; the header is wrong because it describes flow rather than what was actually consulted.
      This is the same over-claiming the 2026-09-28 identity work fixed in the other direction, so fix
      it with one rule rather than two patches: the header and the explanation text both derive from
      the evidence that existed, never from which function ran. While in there, the same card stacks
      two paragraphs saying the same thing at different scopes — the general fallback ("couldn't be
      checked against either the product record or the label you photographed") and the per-allergen
      detail ("couldn't check 4 of James Mazza's allergens against this photo"). On a card meant to be
      read in three seconds in an aisle, one of them goes.
- [x] **Scanner targeting box, and a fallback when the barcode won't read.** *The box shipped
      2026-10-24 as a guide only (`client/src/BarcodeScanner.tsx`); decoding only inside it and the
      label-photo fallback below are both in "Plan to judging" (items 5 and 1).* The camera scanner
      gives no indication of where to hold the package, so it hunts across the whole frame and
      takes longer than it needs to. Draw a reticle — a bounded box with the live view dimmed
      outside it — and, if the decoding library supports a region of interest, restrict decoding
      to that box: a smaller decode area is faster per frame as well as clearer to aim at.
      Then, when no barcode decodes within a set interval, surface the ingredients-label photo
      as an alternative rather than leaving someone pointing a camera at nothing.
      Open question worth deciding deliberately rather than by default: whether that switch is
      automatic or offered. Automatic is fewer taps one-handed in an aisle, which is the stated
      primary context (2026-09-27). But a scanner that gives up on its own while someone is
      still lining up the shot is worse than one that waits, and barcodes on crushed or curved
      packaging often read on the third try. Lean toward surfacing the offer on a timer while
      the scanner keeps running, so nothing is taken away from the user — the same reasoning
      that made the Path D photo prompt an offer rather than a redirect.
      Note this is the same junction Path D already models — barcode first, label second —
      reached from capture failure instead of from thin data. It should reuse
      `decideEvidenceNeeded`'s vocabulary rather than inventing a parallel one, and the resulting
      scan is a label-only Path C scan, not a `combined` one: there is no barcode evidence to
      combine, so `photoSourced`'s `unable_to_confirm` floor applies unchanged.

- [ ] A correction can only be reported from the live scan result — scan history is read-only and
      there's no per-scan route, so there is no path back to a past scan. The realistic moment
      someone notices a verdict was wrong is later, with the package in hand, which means reports
      are lost at the point the community layer depends on them most. Consider a per-scan detail
      route carrying the report form.
- [ ] Error and empty states throughout. Design references for this whole pass live in
      `docs/design-references.md` — read it before styling anything
- [ ] Accessibility pass — keyboard navigation, contrast, labels, screen reader on the verdict card *[bonus]*.
      Touch-target and text-size minimums are in `docs/design-references.md`
- [ ] Mobile layout verified on a real phone
- [ ] Run the full compliance check in `CONTEST_RULES.md` §9
- [ ] Verify every kill-switched feature in its **off** state too, not just its on state — the
      `LABEL_SCAN` gating bug (`docs/journal.md` 2026-09-25) shipped past 236 passing tests and a
      full local pass because the switch was `on` in local `.env` the whole time Path C was built
      and tested, so nothing ever exercised the disabled path. A well-tested enabled state doesn't
      prove the disabled one was ever checked
- [ ] Path C's "What we read from your photo" panel renders only `extracted_text`
      (`ingredients_text`) and omits the `contains`/`may_contain` statements the extraction also
      captured — the cross-check panel shows the parent less than the app actually read, and the
      allergen statement is exactly the part they'd most want to verify against the package. Neither
      gap is cosmetic-only: `runLabelScan`'s response doesn't even send `contains`/`may_contain` to
      the client today, so this needs a server-side field added as well as the panel rendering it.
      Also checked whether span validation can silently reject a legitimate citation from that
      statement, since `spanValidator.ts` validates every `citedSpan` against `ingredients_text`
      alone (`reasonVerdict.ts`'s `discardUnverifiableClaims`) — it can't, but not because the gap
      doesn't exist: `contains`/`may_contain` are never included in the text `reasonVerdict` is
      given at all, so the model has nothing to cite from them during Path C's reasoning step; they
      only reach a verdict via the deterministic pass's exact tag-match (same as Path A's
      `allergensTags`/`tracesTags`), never free-text reasoning over the actual sentence. If a future
      change ever folds that sentence into what the model reasons over — the more useful fix, since
      tag-matching "may contain traces of tree nuts" as a single token loses information a sentence
      has — span validation has to check citations against `ingredients_text` **and**
      `contains`/`may_contain` combined, not `ingredients_text` alone, or a real citation from that
      line would be wrongly discarded. Found in live testing, 2026-09-25
- [ ] The per-allergen `Classification` string union is declared independently in at least three
      places (`match.ts`'s deterministic-only type, `mergeVerdict.ts`'s `MergedClassification`,
      `applyCorrections.ts`'s inline `MatchedAllergenLike.classification`) plus a fourth, separate
      copy on the client (`api.ts`'s `Classification`) — none share a single source. Same story for
      the logic that reads it: the rollup (contains → unresolved → caution → "safe") is duplicated
      between `mergeVerdict.ts`'s `rollupVerdict` and `applyCorrections.ts`'s `rollupResult`, and the
      per-allergen label map is duplicated between `Scan.tsx` and `ScanHistory.tsx`. Adding
      "unchecked" (2026-09-26, the per-allergen photo-sourced granularity fix) needed a manual grep
      across all of these to find every place a missed case would silently misrender or, worse, let
      an unsafe verdict fall through to "safe" — TypeScript's exhaustiveness checking never fires
      across independently-declared unions, so nothing here would have caught a missed copy at
      compile time. It didn't bite this time only because the grep was thorough. Collapse to one
      shared type and, where feasible, one shared rollup/label implementation, so the next new
      classification value is a compile error in every consumer instead of a manual audit
- [ ] `pool.query()` called without a type parameter returns effectively-`any` rows, and spreading
      one of those rows into a return object literal (`{ ...rows[0], someField }`) widens the whole
      literal to `any` — which silently defeats TypeScript's checking of that literal against
      whatever return type is declared, including every field that came from elsewhere in the
      literal, not just the spread part. Concretely: `applyCorrections.ts`'s `ScanForCorrection`
      declares `result: string`, but every real value flowing through it is a `Verdict`
      (`"safe" | "contains_allergen" | "may_contain_caution" | "unable_to_confirm"`) — a real typing
      gap. `scans.ts` and `labelScan.ts` both build their response objects by spreading an untyped
      `pool.query()` row (`const { rows } = await pool.query(...)`, no `<T>`) into the same literal
      that also sets `effective: community && { result: community.result, ... }`, so the mismatch
      compiled clean in both. `combineScan.ts` builds its return objects with no such spread, and the
      identical assignment failed to typecheck for real — the annotation had to be corrected to
      `result: string` to match what the value actually is, rather than what it should be. Audit
      other call sites for the same shape (an untyped `pool.query()` row spread into a typed return
      or response object) — this is TypeScript being defeated precisely at the database-to-domain
      boundary, which is exactly where the app's safety types (`Verdict`, `Classification`, and
      friends) are supposed to be doing their job. Found while building `combineScan.ts`, 2026-09-27.
- [ ] Run the age-gate verification checklist in `docs/coppa.md` §4
- [x] Password change (Settings) + admin-issued reset flow for locked-out accounts — change
      revokes every *other* session for that user, keeping the caller's own session alive; reset-
      token consumption revokes *all* sessions, since there's no current one to preserve. No
      email anywhere — reset tokens are generated on the box by JT and handed over out of band
      (`docs/server-setup.md` §15). Built after a manual password rotation for the judge account
      left its old session live, defeating the point of the rotation.
- [x] Account deletion: removes solo-owned profiles, their scans, and follow relationships;
      transfers a co-managed profile to its longest-standing co-manager instead of destroying it;
      corrections are deliberately excluded (`docs/coppa.md` §2.7)
- [x] Judge account seeded and tested end to end from a fresh browser, including re-running the
      seed script over an already-seeded database — that rerun is the recovery path if a judge
      deletes the account mid-week. Done 2026-10-01 on production: seed run twice per
      `docs/server-setup.md` §16, the second time with `JUDGE_PASSWORD` set via `read -s`, so the
      recovery reseed has run on the live box too. Then JT, from a fresh private browser as
      `judge@demo.circlebite.test`:
      - login works; Maya, Leo and Noor all present
      - Maya's history shows all four verdicts (No listed allergens found, Contains, May contain —
        caution, Unable to confirm), with the disclaimer + 911 panel at the top
      - as owner and co-manager the report form offers all three types; on Noor (follower) it
        offers only "This product has an allergen the card didn't flag"
      - `2990000000076` for Maya: Contains, Peanut "reported by 1 shopper", product data alone says
        Unable to confirm, 911 line present

      *Superseded 2026-10-08:* the list above is what the Oct 1 seed showed, kept as the record.
      Since the Oct 7 seed change there are four judges (`judge1`–`judge4@demo.circlebite.test`) and two
      reporting families, so re-verifying `2990000000076` for Maya expects Peanut "reported by 2
      shoppers", plus "We couldn't check 1 of Maya's allergens — there's no product data on file to
      check it against: sesame." (`judgeSeed.test.ts` asserts both). The card only escalates with
      `COMMUNITY_CORRECTIONS=on`.
- [x] Scan history repeats the whole "Originally Unable to confirm — changed because of…" block on
      every community-escalated entry, so with several of them the page gets long fast (seen on the
      judge account, 2026-10-01: three scans of the same seeded barcode, three identical blocks).
      Consider a shorter per-entry line — the headline verdict plus a one-line "escalated by 1
      shopper report" — with the full block on the live card only, or behind a disclosure. Keep the
      original verdict visible either way: the never-silently rule (docs/legacy-spec.md §6) is the
      reason the block exists.
      *Done 2026-10-28 (`2b43999`), with the item above. The original verdict is visible again since
      `aea942e`: each changed entry's summary opens with it, outside the disclosure — "Was Unable to
      confirm — changed by shopper reports." — for your report, shopper reports, circle reports and
      a report a severe_only follower can't see. The explanation stays in the closed "Details".*
- [ ] **`scansLabel.test.ts` depends on the local `.env`.** Its kill-switch tests assert
      `LABEL_SCAN` is unset and fail when `server/.env` has `LABEL_SCAN=on`, which is exactly what
      checking the photo flow locally needs (found 2026-10-17). Tests should set the switch
      themselves, on and off, rather than assume the developer's file. Until then, run the server
      suite with `LABEL_SCAN=off npm test -w server` (a shell value wins over dotenv).
- [x] **One pending, unverified removal turns the reporter's own card green.** Found on production
      2026-10-23: after `timmy` reported sesame absent on Oat Biscuits, timmy's own view of that
      scan read "No listed allergens found", the cleanest verdict the app gives, from one family's
      report that nobody has confirmed. A pending `remove_caution` clears its allergen in the
      reporter's view at once (`server/src/corrections/applyCorrections.ts`, only rejected removals
      are skipped), and the rollup then has nothing left to flag. That's by design — a correction
      overrides the reporter's own view immediately (`server/src/routes/corrections.ts`) — but it is
      the weakest evidence making the loudest claim — the same problem the circle card fixed for pending escalations ("the weaker
      claim shouldn't be the louder one", Oct 19). Decide the wording: the card should say the
      warning was lifted by the reporter's own unconfirmed report, not present it as a clean label.
      **Done 2026-10-23** (Option A, JT's choice): a removal is noted on the reporter's own row —
      "you reported it isn't in this — pending review" — and never applied; the headline stays what
      the product data says. Pending and three-family-corroborated removals alike. Decision:
      `docs/principles.md`; `docs/verdict-engine.md` principle 6 amended. Test: "no removal that
      hasn't been rejected can lower the headline or any row, in any starting state"
      (`applyCorrections.test.ts`).

## Week 10 — Nov 17–19 · Submission prep *[10% presentation]*

- [ ] One-page summary: problem, solution, how AI does the work, what was learned
- [ ] Demo script following the five-beat sequence in `docs/verdict-engine.md`. Keep account
      deletion out of the demo path: it's real and permanent on the live site. Deleting requires
      typing the account's own email, so it can't happen by a stray click, but a judge testing the
      flow deliberately would take the seeded demo data with it (see the seed-script item above)
- [ ] Dry run timed at 5–10 minutes
- [ ] Judge credentials sent by **one-time secret link, never plain email**. Send alongside them a
      one-line invitation to register their own account too, if they want to see signup and the 18+
      age gate first-hand — that's a graded feature (`docs/coppa.md`) a judge would otherwise never
      exercise, and it costs nothing. The seeded account stays the main path regardless: a
      self-registered judge lands in an empty app, and the circle in particular can't be seen from
      one account, since it takes a second person to accept an invite and scan on a profile's
      behalf. Also ask judges to try reports against the seeded products (barcodes starting
      `2990000000`), not real ones: a report on a real product is a live warning for real families
      until the next reseed rejects it — and if the judge deletes the account first, nothing can
      find it to reject.
      *Status 2026-10-05:* the link went out (two months / four views), but that email carried
      neither ask above. Both go in the fresh-link email on Monday Nov 16 — see "Send a fresh
      judge-credentials link on Monday of judging week" under Prof. Yoest's Oct 1-2 conditions.
- [ ] `AI_DAILY_SPEND_CAP_CENTS` defaults to 200 ($2.00/day) — sized when a scan meant exactly one
      Anthropic call (Path B's `reasonVerdict`). Path C makes it two (extraction, then reasoning),
      and a failed extraction still spends one call before it can even fail. The adaptive flow
      (Path D) can now make it three on a single combined scan — Path B's own reasoning call for a
      thin barcode, then the label's extraction call, then the label's own reasoning call — and a
      severe-allergen profile will hit this path on most scans (see Path D's "consequence to know"
      note above), not just occasionally. Tripping the cap fails closed to `unable_to_confirm`
      (correct behavior, but it reads as a broken app if it happens mid-demo). Decide the
      judging-week value deliberately, not by leaving the default in place and hoping — before
      `LABEL_SCAN` gets flipped on for judging, not after
- [ ] Confirm to Prof. Yoest that the instance stays running through judging *(R10)*
- [ ] **Check the production AI key hasn't expired before judging.** "circlebite prod" expired
      Oct 10 without anything saying so (`docs/journal.md`, 2026-10-16/17). The current key,
      "circlebite prod 2026-10", expires Dec 31, 2026. Before judging: the Console shows it active
      with a recent "Last used", a label photo on production gets a real result, and
      `journalctl -u circlebite | grep 'AI step failed'` is quiet. Rotate before Dec 31 per
      `docs/server-setup.md` §6a, whatever happens with judging.
- [ ] Freeze the code

## Nov 20 — Judging, over Zoom

- [ ] Shortly before judging opens, rerun the judge seed on production (`docs/server-setup.md` §16)
      as a **plain run, without `--rotate-passwords`**, so each judge keeps the password already
      sent (since `c4c1041`, a reseed keeps every surviving judge's password). This
      refreshes the scan dates (seeded history is dated relative to the run, and would otherwise
      read as two months old) and clears test activity on the judge account — including JT's two
      extra `2990000000076` scans in Maya's history from the 2026-10-01 verification.
- [x] **Hazard: production's demo warning stands only because its status is grandfathered.**
      *Done 2026-10-08:* JT reseeded production from release `c46660c`. Judge 1's Maya on
      `2990000000076` now reads "reported by 2 shoppers" on both lines, with the unchecked-sesame
      note (JT, live card). The from-current-release rule below still holds for every future reseed.
      Checked 2026-10-08. Production has **one** seeded peanut report on `2990000000076`, corroborated
      2026-10-01 under the old threshold of 1. Its product rows were last seeded 2026-10-05. Deploys
      run migrations, never the seed, so the Oct 7 seed (two reporting families, four judges) has
      never run there. Nothing re-checks a `corroborated` status after the threshold rises, so the
      card still escalates. It reads "reported by 1 shopper", which contradicts the two-family rule
      the README states. And that one shopper is Priya, Maya's own co-manager (seed as of
      `3923698`), so it isn't the cross-family warning the demo exists to show. Before the next
      production reseed:
      - **Reseed from the current release only** (`~/circlebite/current`, cloned from main). From
        `4b3c0e2` onward the seed files two families and rolls back with `SeedNotCorroboratedError`
        if they fall short, so it fails loudly. A seed from `2520115` through `4e622f2` is the
        dangerous one: threshold 2, one report, no guard. It commits a claim that stays `pending`,
        and Maya's `2990000000076` then shows plain Unable to confirm with no error anywhere.
      - **The current seed changes the judge login.** It deletes every account on the seed domain,
        including `judge@demo.circlebite.test`, and creates `judge1`–`judge4@demo.circlebite.test`.
        The credentials sent on 2026-10-05 predate that, so "the same `JUDGE_PASSWORD` keeps them
        working" (item above) is no longer true. The fresh-link email on Nov 16 has to carry the new
        logins, and the reseed has to happen before it goes out.
- [ ] Check the review queue (`/admin/review-queue`) daily. A judge's reports are rejected by any
      reseed, but if a judge deletes the account first those reports turn anonymous and the seed can
      no longer find them — the queue is the only place they'd show up

---

## Deferred until after judging

Out of scope per `CONTEST_RULES.md` §7 — do not start these before judging ends on November 20.

- iOS build via Capacitor, Apple Developer Program enrollment ($99/yr), App Store submission
- Admin analytics beyond the AI accuracy page
- Scan history beyond the last handful per profile
- Migrating real alpha tester data
- Decide a retention rule for corrections and their photos — currently unbounded on purpose
  (`docs/coppa.md` §2.7). Needs its own number and rationale, not invented mid-build.
- Say "the check couldn't finish" outside the live card too (`89b1e39` did the live card only).
  Scan history still shows a failed AI check the old way — a photo scan reads "couldn't check …
  against this photo" — because history rows don't carry whether the check failed; it needs a join
  on `verdict_explanations.failure_reason` / `label_extractions.failure_reason`. Same gap in "That
  wasn't this product": the restored barcode verdict is re-explained from a snapshot that doesn't
  record whether that scan's own AI step failed (`combineScan.ts` `discardLabelEvidence`).
- Wrong-product reports still lower the reporter's own card to "Unable to confirm" — by design (the record is for another product, so none of its claims hold), unlike a removal, which since 2026-10-23 is only noted (`applyCorrections.ts`). Revisit after judging.
- Harden corroboration against fake families before any removal travels
  (`docs/fake-family-risk.md`, Prof. Yoest's Oct 19 ask). Both, tested, before a corroborated
  `remove_caution` is read outside the reporter's own view:
  (a) count only families with scan history beyond the scan the report is filed from;
  (b) flag reports on one claim whose photos or origin look like the same hand, into the review
  queue. (b) needs a `docs/coppa.md` decision on keeping origin data first. Neither is built.
