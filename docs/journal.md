# Build journal

One short entry per working session. This exists for three reasons:

1. The judging deliverable requires a one-page summary including **what you learned** — that is
   written from this file, not from memory in November.
2. It gives a new Claude Code session context on where things stand without re-reading the codebase.
3. It is honest evidence of an iterative build, alongside the commit history.

Keep entries short. What you tried, what broke, what you decided, what's next. Write it at the end
of a session, not the beginning.

---

## Status as of 2026-09-10

Through Week 7 of `BACKLOG.md`: auth, allergen profiles, and the full circle invite flow are built;
scan-to-verdict works end to end, deterministic matcher plus the Path B AI verdict engine, both
confirmed against the real deployed app with a real key — a genuine AI escalation, the fail-closed
path, and a real defect in the deterministic matcher's word-boundary matching that the AI surfaced
and got fixed (see the three 2026-09-10 entries below). Still open from earlier weeks, not yet
started: the 24-month scan-history retention job, the judge-account seed script, a `DELETE /account`
endpoint, and password reset. Week 8 — the overrule loop — has its recording path and (as of the
evening of 2026-09-10) corroborated additions reaching other profiles — browser-checked, deployed,
and switched on in production, plus the AI accuracy page itself (planned with JT, then built the
same day — see the entry below). Login/register rate limiting, open since Week 1, is now built too
(2026-09-11 entry below) — not yet deployed. Next: the review queue.

---

## Template

```
## YYYY-MM-DD — <what this session was about>

**Did:**
**Hit a wall on:**
**Decided:**
**Next:**
```

---

## 2026-09-08 — Reset the project for the contest

**Did:** Audited the existing SureBite repo against the contest FAQ. Found four disqualifying
problems: it was built on Lovable, hosted on Lovable with Supabase as the backend, the wrong
framework with no exemption, and a commit history that predates the contest with 142 commits titled
"Changes". Also found `.env` tracked in git. Disclosed the prototype to Prof. Yoest and requested a
framework exception.

**Decided:** Fresh public repo, rebuild in TypeScript, self-host Postgres on my own EC2 instance.
Deciding argument for TypeScript over Laravel was that one codebase carries through to an App Store
build after the semester. Wrote `CONTEST_RULES.md` as the binding document and `CLAUDE.md` /
`AGENTS.md` so every AI session reads the rules before proposing anything.

**Learned:** "Built with AI" and "built on a no-code platform" are different things, and the contest
draws the line at who controls the code and the infrastructure — not at how much AI wrote it.

**Next:** Create the public repo, AWS account with billing alerts, submit the idea by Sept 14.

---

## 2026-09-08 — Framework approved

**Did:** Prof. Yoest approved the TypeScript stack in writing and cleared the prototype disclosure.
Saved the email to `docs/approvals/`.

**Decided:** Treating his safety note — disclaimer upfront in the UI, detailed overrule log — as a
requirement rather than advice. It's written into `CONTEST_RULES.md` §3.

**Next:** Repo and AWS setup.

---

## 2026-09-09 — Server provisioned

**Did:** Launched the production box: EC2 t3.micro, Ubuntu 24.04 LTS, 30 GiB, us-east-2, with an
Elastic IP so the address survives reboots. Security group allows SSH from my IP only, HTTP and HTTPS
from anywhere. Zero-spend billing alert set before provisioning anything. Added a 2GB swap file,
installed nginx, Node 22, and PostgreSQL 16, rebooted for the new kernel, and created the
`circlebite` database and role. Full runbook in `docs/server-setup.md`.

**Hit a wall on:** Ran the database setup with the literal placeholder `PASTE_PASSWORD_HERE` still in
the command, so the role got created with that as its actual password. Fixed it with `ALTER USER`,
and rewrote the step so it generates the password and writes it straight into `.env` — no copying, so
the mistake can't happen again.

**Decided:** Ubuntu 24.04 over 26.04. 26.04 is newer but third-party repos like NodeSource lag a new
release, and I'd rather not lose an evening to a packaging problem that has nothing to do with the
app. Also used hex rather than base64 for the database password, because `/` and `+` need escaping
inside a connection URL.

**Learned:** Swap has to be added before the first Node build, not after it fails — 1 GiB of RAM
isn't enough, and the failure looks like a code error rather than a memory error. And the
`/etc/fstab` line is the part that actually matters; without it the swap vanishes on the next reboot.

**Next:** Domain and DNS, Let's Encrypt certificate, nginx reverse proxy, then the app itself behind
a working login.

---

## 2026-09-09 — Live at circlebite.app

**Did:** Pushed the repo public (github.com/jamesthomasmazza-byte/circlebite). Bought circlebite.app,
pointed both A records at the Elastic IP, wrote an nginx server block, and got a Let's Encrypt
certificate via certbot. The site is live over HTTPS with a placeholder page.

**Hit a wall on:** Neither `gh` nor Homebrew was installed on my Mac, so pushing turned into a
half-hour detour installing a package manager first. Also pasted the repo commands into the SSH
session instead of my own terminal — the prompt tells you which machine you're on, and I wasn't
reading it.

**Decided:** Went with `.app` over `.com`. It's on the HSTS preload list, so browsers refuse to load
it over plain HTTP at all — free security posture for a graded hygiene category. Used my personal
email for certificate renewal notices rather than my school address, since the domain outlives my
CUA account.

**Learned:** DNS has to resolve before certbot runs, not after — the challenge is an actual HTTP
request to the domain, so `dig +short` is the gate. And `.app` can't be tested over http:// at all,
which makes a failed certificate look like a broken server.

**Next:** Node app on 127.0.0.1:3000, swap nginx from static files to a reverse proxy, systemd unit,
then a real login. Idea submission due Sept 14.

---

## 2026-09-09 — Corrected the scope: the circle is the product

**Did:** Rewrote the README thesis, `CONTEST_RULES.md` §7, `CLAUDE.md`, `AGENTS.md`, and the backlog
to put circle sharing back in the core spine instead of the "if weeks allow" pile.

**Decided:** The spine is now auth → profile → **circle invite** → scan → AI verdict → correction.
Scan history and admin analytics move out to make room.

**Learned:** I let a scoping instinct — ship the smallest thing that works — quietly cut the feature
the whole product is named after. The premise isn't "scanning labels is tedious," it's that the
person holding the package usually isn't the person whose allergies are at stake. A parent knows
their kid's allergies by heart; a grandparent or a friend's mom doesn't. Without the circle it's a
commodity barcode scanner, and the AI explanation matters far less, because the person scanning
already has the context. Worth remembering when a plan starts optimizing for what's easy to finish.

**Next:** Idea submission by Sept 14, then auth.

---

## 2026-09-09 — Legacy spec written, and a better AI idea

**Did:** Wrote `docs/legacy-spec.md` — the prototype's seventeen routes, eight tables, allergen
synonym clusters, verdict rules, circle/invite model, and correction lifecycle, described in prose so
Claude Code can build from it a section at a time. No code copied; this is the design-as-reference
arrangement Prof. Yoest approved.

**Decided:** Added a fourth input path to the verdict engine — scan the barcode *and* photograph the
label, then reconcile the two. My own idea, and better than the OCR-fallback I had specced. Open Food
Facts is crowd-sourced and goes stale when manufacturers reformulate, so the dangerous case isn't a
missing record, it's a record that says safe about a product that has since added milk. The keyword
matcher can never catch that because it only ever sees one source.

Rules that came out of it: the label outranks the database; a stricter label always escalates the
verdict; a looser label is never a clearance (a bad photo is likelier than a wrong database); and a
conflict is displayed, never silently resolved.

**Learned:** Two things the prototype already stores turn out to be exactly what this needs —
`product_last_updated` is the staleness signal that decides when to ask for the label photo, and the
raw `product_data` snapshot makes any verdict reconstructable later. Also that this shouldn't fire on
every scan: two scans in a grocery aisle is friction that gets an app deleted. Gate it on severe
allergens, stale records, thin data, or an unconfirmed "safe."

**Next:** Idea submission by Sept 14. Then auth, with the circle in scope from the start.

---

## 2026-09-09 — Brought the principles and COPPA specs into the repo

**Did:** Copied two documents from the prototype's working folder into `docs/`: the mission and
operating principles, and the COPPA implementation spec. Both are my own writing, not generated
project code. Edited the principles doc to remove a licensing cost figure and cross-references to a
private competitive-strategy document, since this repo is public. Adapted three lines of the COPPA
spec where it assumed row-level security from the hosted platform.

Wired them in: `CLAUDE.md` and `AGENTS.md` now point at both, the age gate is a Week 1 backlog item
inside auth, and the verification checklist is a Week 9 item. Also corrected the corroboration
thresholds in `legacy-spec.md` — one report to add a warning, three to remove one, which is more
precise than what was there.

**Decided:** Deliberately left out of the public repo: the marketing plan and creator outreach docs
(real people's email addresses), and the competitive analysis, moat action items, IP assessment and
licensing costs (publishing a moat strategy hands it to competitors). Those stay on my Desktop.

**Learned:** The public repo is a publishing decision, not just a version control one. Worth asking
of any file before it gets committed: who else can read this, and does it hurt me that they can.

Also: the age gate has to be built inside auth, not after it. It changes signup, terminology,
invites, admin exports, deletion and retention — bolting it on in November would mean touching all of
those again. Better to know that the week before writing auth than the week after.

**Next:** Idea submission by Sept 14. Then auth, with the age gate and the circle in from the start.

---

## 2026-09-09 — Idea submission sent

**Did:** Sent the idea submission, five days ahead of the Sept 14 deadline. Short email with the
thesis in the body and a one-page PDF attached. Framed the thesis as a Golden Circle — why, how,
what — which fit because the *why* is genuinely where this project started rather than something
reverse-engineered from a feature.

**Decided:** Put the repo and live URL in the email body, not only the PDF, so they're clickable even
if only the email gets read. Most submissions this week will be a paragraph of prose; this one links
to a working HTTPS site and a public repo with real commits.

**Learned:** Writing the one-pager forced the pitch to get shorter and clearer than the version I had
in my head, and the cross-reference idea — barcode plus label, database as a claim rather than a fact
— only landed as the headline once I had to fit it in three sentences.

**Next:** Auth, with the age gate and the circle in scope from the start.

---

## 2026-09-09 — Auth layer built and verified in a real browser

**Did:** Built the Week 1 spine end to end: npm-workspace TypeScript project (React/Vite client,
Node/Express server), plain-SQL migrations with a small hand-rolled runner, `users` with
`age_attested_adult`/`age_attested_at` and no raw DOB anywhere, scrypt password hashing, the
neutral date-of-birth gate with a 24h retry-prevention block, DB-backed sessions (HMAC'd token,
`acting_profile_id` riding along as a non-authoritative UX hint for the multi-profile future),
`requireAuth` middleware plus `GET /me` as the first protected route, and the
`authorization/README.md` convention for the resource-scoped checks weeks 2–3 will need. Installed
a local Postgres 16 via Homebrew — same major version as the production box — specifically so this
could be verified against real data instead of stopping at a type-check.

**Hit a wall on:** Clicking through the register form in an actual browser (once Chrome tools were
on) surfaced something the curl-based testing hadn't: register handed off to a separate login
screen instead of landing on the dashboard. Not a bug — it's what the plan said it would do — but
seeing it happen live made it obviously wrong for a single-adult-account product, and led to the
auto-login change below. Separately, one browser click landed on the date field instead of the
submit button (stale coordinates after the DOM shifted) and looked exactly like a validation
failure — no error, no request sent — until I clicked the actual button position and got the real
result. Worth remembering: a silent no-op in a browser check is worth confirming the click landed
where intended before assuming the code is broken.

**Decided:** Register now creates a session and lands directly on the dashboard, matching what
login does — no more register→login handoff. Auto-login removes the one point where retyping a
password at a separate screen would have caught a typo, and password reset doesn't exist yet, so
added a confirm-password field, checked client-side before the request goes out. Left "authorization
checks in application code on every query" unchecked on the Week 1 backlog rather than marking it
done — `requireAuth` only proves identity; there's no profile-scoped resource yet for the
`authorization/` convention to actually guard, so the real test of that pattern starts in weeks 2–3
with `allergen_profiles`.

**Learned:** Curl-level verification and browser verification catch different classes of problems.
The full register→login→dashboard round-trip passed every status-code check I wrote against it, and
still shipped a UX decision I wouldn't have made looking at it as a user would. "Returns the right
status codes" and "is the right flow" are different claims — the second one needed a browser, not a
terminal.

**Still open, honestly:** No password reset exists at all. Combined with auto-login on register,
a mistyped-but-self-consistent password (confirm field matches the typo) or a typo'd email now
locks someone out of that account with no recovery path — worth deciding in weeks 2–3 whether reset
lands there or gets deferred with the risk written down, not just implied. No login rate limiting or
brute-force throttling exists on `/auth/login` — not unverified in the sense of "built but not
tested," genuinely not built at all; nothing currently slows down repeated password guesses against
a known email. Neither of these has shipped to the EC2 box yet — everything this session was run
and verified locally.

**Next:** Weeks 2–3 per `BACKLOG.md`: `allergen_profiles`, `profile_managers`,
`follow_relationships`, the circle invite flow, and the deletion-cascade FKs decided in this
session's auth plan. Decide password reset and login throttling's place in that window rather than
letting them slide to week 9.

---

## 2026-09-09 — Ultrareview on the auth layer: 10 findings, one of them a safety feature that had become an abuse vector

**Did:** Ran ultrareview against the auth code from the session above. It came back with 10
findings across `ageGate.ts`, `routes.ts`, `AuthContext.tsx`, and `migrate.ts` — two high severity,
the rest normal or low. Fixed all ten, each its own commit, verified against real reproductions
(a real Postgres instance, a real forced-failure trigger, a real race condition reproduced with an
artificial server-side delay and confirmed to actually happen without the fix) rather than
reasoning about the code and assuming.

**The one worth remembering most:** the signup-block retry-prevention mechanism — built earlier
this session specifically to satisfy `docs/coppa.md` §2.1 — turned out to be exploitable as a
denial-of-service against a third party's email address. `blockSignup`'s `ON CONFLICT DO UPDATE`
refreshed the block's 24h clock on every call, and since the register handler only ever reaches
`blockSignup` when no block is *currently* active, an unauthenticated attacker could keep an
arbitrary victim's email permanently blocked from registering — no ownership proof, no
authentication, just one request roughly every 24 hours, forever.

This wasn't a corner cut under time pressure. It was a feature built correctly to spec, reviewed,
tested, and committed in the same session, and it still took a second pass — ultrareview looking at
the same code from an attacker's seat instead of a user's — to see it. The fix (`ON CONFLICT DO
NOTHING`: a block fires once and only ever expires, never renews) works cleanly because
`signup_blocks` was never the actual safety boundary in the first place — `evaluateAgeGate`
re-derives the real 18+ answer from the submitted DOB on *every* request, independent of this
table entirely. Tracing that distinction — which pieces of the auth layer are the actual guarantee
versus which are best-effort deterrents layered on top of it — is what made the fix obvious once
found. It's going to matter again in weeks 2–3: `acting_profile_id` in the session is deliberately
the same shape (a UX hint, never trusted for authorization), and the circle/invite system will add
more mechanisms like it.

**Also found and fixed, same session:** the age gate compared a timezone-less DOB against the
server's raw UTC clock, which could admit a still-17-year-old as an adult up to ~12 hours early
depending on the requester's timezone — fixed by anchoring the comparison to UTC-12 instead, so it
can only ever delay a real adult, never admit a minor early (same asymmetric-caution logic
`docs/principles.md` already applies to allergen verdicts, applied here to the 18+ boundary). Plus:
a fail-open path where a transient DB error while writing the block could skip refusing the request
entirely; a migration runner that would hang instead of exiting cleanly on failure; a client-side
race where a slow, stale identity check could clobber a just-completed login back to logged-out; a
transient `/me` hiccup that could show a false "something went wrong" right after a real
registration actually succeeded; a failed logout that left the UI stuck showing a stale logged-in
state; a first-request timing leak in the login anti-enumeration mechanism; register hashing the
password before checking whether the email was already taken; and a redundant network round-trip
after login/register.

**Learned:** the automated review earned its keep specifically by not sharing my assumptions about
what the code was for. I traced `blockSignup`'s reachability correctly when writing it, but only in
terms of "does this correctly implement retry prevention" — never "what can someone who isn't the
account owner do with this endpoint." Worth asking of any unauthenticated write path from now on,
not just at review time.

**Next:** Weeks 2–3 per `BACKLOG.md` — `allergen_profiles`, `profile_managers`,
`follow_relationships`, the circle invite flow. Carry the "what's the actual boundary versus what's
best-effort" question into that work explicitly, since the circle's follow/revoke mechanics are
exactly the shape where this kind of gap tends to hide.

---

## 2026-09-10 — Deployed. Live at circlebite.app for real, not just the placeholder.

**Did:** Switched nginx from serving the static placeholder to reverse-proxying a real, running Node
app. Built atomic, symlink-swap deploy scripts (`scripts/deploy.sh` clones fresh and hands off to
`scripts/release.sh`, which only swaps `~/circlebite/current` and restarts if install/build/migrate
all succeed), a systemd unit, and the nginx edit — then actually ran the whole thing against the
production box: bootstrapped `~/circlebite`, generated `SESSION_SECRET` on the box, ran the first
deploy (all three migrations applied fresh against the real production database), and switched
nginx over. Verified against the live domain, not localhost: registering with an under-18 DOB
returns `age_gate_blocked` on `circlebite.app` itself, the session cookie on a real register/login
carries `HttpOnly; Secure; SameSite=Lax`, `/dashboard` redirects to `/login` when logged out, and a
full register → dashboard → logout round trip works end to end in an actual browser on the real
domain. Cleaned the synthetic test account and its leftover `signup_blocks` row out of production
afterward — the database is empty again, exactly as it should be before real seed data goes in.

**Hit a wall on:** SSH to the box timed out at the start of this session — a stale "My IP" rule in
the security group, exactly what `server-setup.md` §1 already warned would happen. I have no AWS
console or CLI access, so this one was a genuine stop: asked to have the security group updated,
then picked back up once it was. Once SSH did connect, it failed a second time with "Host key
verification failed" — not a real problem, just that `known_hosts` had entries for the box's IP from
an earlier session but none for the `circlebite.app` hostname itself, and `BatchMode` won't prompt to
add one. Fixed correctly with `-o StrictHostKeyChecking=accept-new` (trusts a genuinely new host,
would still fail loudly on an actual mismatch) rather than reaching for
`StrictHostKeyChecking=no`, which would have accepted anything.

The more consequential wall: a local test harness for the deploy scripts (a fake `$HOME/circlebite`,
cloning from the local repo, systemd's restart simulated with a background node process) caught a
real bug before it ever reached the box — `tsc` never copied the migration `.sql` files into `dist/`,
so the compiled migration runner (`node dist/db/migrate.js`, what production actually uses) would
have failed outright with `ENOENT`. Every local test of migrations up to that point had run
`migrate.ts` through `tsx` against the source directly, so `dist/db/migrations` was never in the
picture and this never surfaced. Fixed by having the build script copy the migrations directory into
`dist/` after `tsc` runs.

**Decided:** Build on the box, not locally with an artifact copied up — the swap file was already
provisioned specifically for this, the repo is public so a box that can `git pull && build && migrate
&& restart` from nothing is more reproducible than trusting whatever a laptop produced, and there's
no native-dependency risk to avoid in the first place (scrypt over bcrypt, deliberately). The full
reasoning is in the plan file from this session, worth rereading if this decision ever needs
revisiting.

Two separate rollback layers, not one, because they cover different failures: an app-level symlink
revert for a release that built fine but misbehaves at runtime, and an nginx-level fallback to the
static placeholder for when Node is down for a reason no amount of re-pointing a symlink fixes
(crash loop, the database itself unreachable). Tested both for real before trusting either — actually
broke a build on a throwaway branch to confirm the atomic deploy leaves the running app untouched,
and actually reverted nginx mid-session to confirm the placeholder really comes back.

**Learned:** an untested deploy path and an untested rollback are the same kind of mistake — both are
claims about what happens during an incident, and neither should be trusted until something has
actually gone wrong on purpose and been watched recover. The migrations-in-`dist` bug is the sharper
version of the same lesson as the `blockSignup` finding two sessions ago: code that's never actually
exercised through its real production path (the compiled runner, not the dev shortcut) gets to hide
bugs indefinitely. Worth generalizing: before trusting any "this is what happens in production" claim
about this project going forward, ask whether anything has actually run that exact path yet.

**Next:** Weeks 2–3 per `BACKLOG.md`, same as last entry. The judge account and seed data (`R9`) will
need to go through this same deploy path eventually — worth remembering the DB is production-empty
right now, not seeded, so nothing here is ready to demo yet.

---

## 2026-09-10 — Allergen profiles and the full circle invite flow, plus a real Express bug

**Did:** Built the rest of the Week 2–3 spine on top of auth: `allergen_profiles`/`allergens` with a
data-integrity constraint not in the legacy spec (case-insensitive unique allergen names per
profile), `profile_managers`/`follow_relationships`/`manager_invites`, and the FK cascade shape for
all of it — decided and verified empirically in one rolled-back transaction, not just reasoned about,
that deleting a third-party inviter's account leaves an existing co-manager's and an existing
follower's grants completely intact while deleting the grant-holder's own account or the profile
owner's account cascades exactly as intended. `getProfileAccess` is the one place that decides "what
can this user do with this profile," reused by both the authorization gate and the response-shaping
code so the two can't independently drift. Full CRUD for profiles and allergens, then the circle
itself: follow invites and co-manager invites, both per-profile single-use tokens with the share
level fixed at creation rather than the legacy spec's ambiguous "personal link, pick the profile
after someone clicks" model. Owner-only deletion and manager-removal, deliberately stricter than the
general co-manager edit rights. Client side: profile list/create/detail, the circle management
section, and the two public accept pages, wired through a new `returnTo` mechanism so someone who
clicks an invite link logged out ends up back on it after logging in or registering.

**Hit a wall on:** Building `GET /follow/:token` — meant to be public, no login required — surfaced a
real Express routing bug in the `/api` namespacing from two sessions ago. `profilesRouter` has a
router-level `.use(requireAuth)` (middleware with no path, so it matches everything entering the
router), and it was mounted at bare `/api`. Express runs a router's `.use()` middleware before it
even checks whether any of that router's own routes match — so mounting `profilesRouter` at `/api`
made its blanket `requireAuth` intercept *every* `/api/*` request, including `circleRouter`'s
deliberately-public route, before `circleRouter` ever got a chance. First symptom was a plain 401 on
a route with no `requireAuth` anywhere near it, which looked impossible until I actually traced how
Express's router mounting works instead of assuming the bug was in the route I'd just written. Fixed
by mounting `profilesRouter` at the narrower `/api/profiles` instead — the client's URLs didn't
change at all, only the internal scoping did.

**Decided:** Follow stays one table for both the invite and the grant (matching the legacy design's
own `pending → accepted → revoked` lifecycle), while co-manager keeps the legacy spec's two-table
split (`manager_invites` + `profile_managers`) — preserving that existing asymmetry rather than
"fixing" it to be more consistent, since collapsing them into one polymorphic invites table would
blur the follow-vs-co-manager distinction at the schema level and make it easier to accidentally
grant edit rights through a query that forgot to filter by kind. Someone who already has *any* access
to a profile is rejected from accepting a *different* invite type for it (e.g. an existing follower
can't also accept a co-manager invite to "upgrade") — a documented simplification, not an oversight;
upgrading isn't built yet.

**Learned:** the same lesson as the migrations-in-`dist` bug from the deploy session, in a different
shape — Express's `router.use()` running before route matching is exactly the kind of framework
behavior that's easy to get backwards by intuition (I assumed mounting order only mattered for which
router's *routes* got checked first, not that a blanket middleware would run regardless of whether
any route matched). Both bugs were caught by building the next real feature and watching it fail in
an unexpected way, not by auditing the earlier code for problems — worth remembering that the
circle/scan work ahead will keep surfacing this class of thing, and treating an unexpected error as
"trace it, don't assume" rather than "patch the symptom" is what caught this one before it shipped.

**Next:** Weeks 4–5 per `BACKLOG.md` — barcode scanning, the Open Food Facts lookup, the deterministic
allergen matcher, and the verdict card. The profile picker item from this week's backlog is really
part of the scan flow (choosing which profile you're scanning for), so it lands there rather than
here. Also still open from this week: the judge-account seed script and the 24-month retention job,
both deferred on purpose since `scans` doesn't exist yet for either to act on.

---

## 2026-09-09 — Scan to verdict, end to end

**Did:** Built the whole Weeks 4–5 spine: `products` (a 24h-TTL cache, caching a confirmed
*not-found* too so a bad barcode doesn't hit Open Food Facts on every repeat) and `scans` migrations;
the deterministic matcher (`synonyms.ts` + `match.ts`) transcribed from `docs/legacy-spec.md` §3 —
tree-nut umbrella plus eight individually-narrow nuts, peanut kept strictly separate, the full
four-state taxonomy (`safe` / `contains_allergen` / `may_contain_caution` / `unable_to_confirm`) that
fails closed on missing data; the Open Food Facts client, which collapses every failure mode — bad
network, timeout, non-2xx, malformed body, genuine not-found — into the same single "not found"
result, never an exception a caller could forget to handle safely; `POST /api/scans` and
`GET /api/profiles/:id/scans`; and the client — `Scan.tsx` (profile picker, manual entry, then camera
scanning via `@zxing/browser` layered on top of it), `ScanHistory.tsx`.

**Two share-level judgment calls, made deliberately and proven against real data, not just reasoned
about:** the verdict computation always runs against a profile's *complete* allergen list, regardless
of what the scanner themselves is allowed to see — filtering the safety check itself by the scanner's
own `share_level` could mean a `severe_only` follower's scan misses a real (if mild) allergen during
an actual purchase decision, which is exactly the false-safety direction `docs/principles.md` rules
out. And the live scan result shows full matched-allergen detail regardless of share level, while
*history* filters it the same way the profile page already does. Proved both halves with one real
scan: registered an owner and a `severe_only` follower against a profile with Peanut (severe) and
Milk (mild), scanned the real Nutella barcode as the follower and confirmed the live response showed
the mild Milk match in full — then pulled up that *same* scan through the history endpoint and
confirmed it was filtered down to bare-verdict-only (Milk isn't severe, so nothing qualified),
checked in the actual rendered page for both the owner and the follower, not just via curl.

**Hit the same routing hazard again, this time before it shipped:** `scansRouter` has two routes
(`/scans`, `/profiles/:id/scans`) that don't share a mountable prefix — the exact shape that made a
router-level `.use(requireAuth)` dangerous for `profilesRouter` two sessions ago (a blanket
no-path middleware runs on every request entering the router, before Express even checks whether any
of that router's own routes match, so mounting it at a broad prefix silently intercepts unrelated
routes mounted alongside it). Recognized the shape from memory this time and applied `requireAuth`
per-route from the start, matching `circleRouter`'s already-proven pattern — confirmed with a curl
check that the public `GET /api/follow/:token` route still worked correctly once `scansRouter` was
mounted alongside it. Three sessions in a row now this exact bug class has come up; it's fully
internalized as "any router with a blanket auth middleware must be mounted at a prefix matching all
its own routes, or the middleware goes per-route instead," documented in code comments in all three
files it's touched (`profiles.ts`, `circle.ts`, `scans.ts`).

**Decided:** `AllergenVerdictDetail` carries each match's `severity` in the stored JSON snapshot,
discovered mid-build to be necessary for the history endpoint's share-level filter. Rejected joining
back to the live `allergens` table at read time instead — a profile's allergen severities can change
after a scan was performed, and the history view is supposed to show what the *scan* found, not what
the profile currently says; re-deriving it from live data would make old scans silently reinterpret
themselves.

**Known gap, stated rather than hidden:** camera-based scanning (`@zxing/browser`) can't be physically
exercised in this session — no real camera is attached to the sandboxed browser used for testing.
What *was* verified: the client builds and type-checks with the new dependency, and a real
click-through in a real logged-in session shows the "Scan with camera" control correctly starting the
video element and its controls (no console errors, button flips to "Stop camera"), proving the code
initializes and hands off into the same `runScan()` the manual-entry path already proved correct
against real Nutella and bogus-barcode data. The actual decode-a-real-barcode path is untested, same
honesty standard as the Chrome-tools-unavailable notes earlier this project.

**Learned:** a bug class caught proactively on the third encounter is a bug class actually learned,
not just patched — worth noticing that pattern-recognition-from-memory is doing real work here, not
just re-reading old code before writing new code in the same area.

**Next:** Weeks 6–7 per `BACKLOG.md` — the AI verdict-explanation layer (`docs/verdict-engine.md`),
the single largest discretionary rubric block. The 24-month retention job and the judge-account seed
script are still open from Weeks 2–3, now genuinely actionable since `scans` finally exists for the
retention job to act on.

---

## 2026-09-09 (later that night) — Camera preview showed nothing; real bug, found and fixed live

**Did:** Deployed weeks 4–5, then got a real bug report a few minutes later: "I'm unable to see what
the camera sees while using the app." Not the known, already-documented verification gap (no camera
in the sandboxed test browser) — a real production bug hit by an actual device with an actual camera.

**Root cause:** `Scan.tsx`'s `<video>` element was only rendered inside the `cameraActive ? ... : ...`
branch. `startCamera()` calls `setCameraActive(true)` and then, in that same synchronous call,
immediately reads `videoRef.current` to hand to `decodeFromVideoDevice()` — but React hadn't
re-rendered yet, so the `<video>` tag didn't exist in the DOM and the ref was still `null` from the
previous render. zxing silently falls back to creating its own detached video element when it isn't
handed a real one, so decoding could still technically run — nothing was actually broken at the
network or permissions level — but there was never an on-page element for the stream to be visible
in. This is exactly the kind of bug the sandboxed verification gap from earlier tonight was
structurally unable to catch: no amount of code review or a "does it initialize without throwing"
check surfaces a bug that only manifests as "the picture never shows up," because nothing throws.

**Fix:** keep `<video>` always mounted, toggle visibility with CSS `display` instead of conditional
rendering, so `videoRef.current` already points at the real on-page element by the time
`startCamera()` reads it. Added `muted` and `playsInline` too, needed for the video to actually
autoplay on mobile rather than sitting paused — a second latent bug in the same code that hadn't
caused a user-visible symptom yet.

**Verified:** confirmed structurally in this session's sandboxed browser (the `<video>` node exists
in the DOM immediately on page load now, and toggling `cameraActive` flips the same node between
`display:none`/`block` instead of mounting/unmounting a new one) and then confirmed for real by the
person who reported it, on an actual device with an actual camera, right after the fix deployed.

**Learned:** the honest "known verification gap" framing from earlier tonight was correct about what
it couldn't prove (a live pixel feed) but didn't go far enough — it should have been a flag to get a
real device in front of the feature before calling it done, not just a footnote to ship past. A
sandboxed "does it initialize" check is a fundamentally different, weaker claim than "a user can see
their camera," and this project's own verification standard (real Postgres, real HTTP, real browser
clicks) already says not to trust the weaker claim when a stronger one is available — worth actually
asking, next time a feature has a stated verification gap, whether that gap is closeable by just
asking the person to try it on their own device before considering the feature shipped.

**Next:** same as above — Weeks 6–7. Ending the session here for the night; nothing else in flight.

---

## 2026-09-10 — Verdict engine, Path B slice: reasonVerdict, span validator, mergeVerdict, wired in

**Did:** Built the first real slice of `docs/verdict-engine.md` — Path B (barcode found, only free
`ingredients_text`, no structured allergen tags at all), chosen because it's the smallest slice that
proves the whole pipeline: model call → span validation → safety-rule merge → stored, reproducible
explanation. Paths A/C/D stay out of scope for this slice.

**Decided, before writing code:** AI provider is Anthropic Claude (`@anthropic-ai/sdk`, Claude Haiku
4.5) — confirmed current pricing against platform.claude.com ($1/$5 per MTok in/out) rather than
guessing. `reasonVerdict()` uses tool-use with a strict JSON schema so the response never needs
prose-parsing. A missing `AI_API_KEY` is treated as just another call failure, not a special case —
keeps the fail-closed path singular and means local dev without a key never breaks other scan types.

**Built, in order:** `verdict_explanations` migration, `scans.source`/`confidence` columns, AI env
config (optional key, model, daily spend cap), `spanValidator.ts` (verbatim case-insensitive
substring check — the cheapest hallucination guard the spec names), `prompt.ts` (allergen name +
severity + trace-handling only, never profile identity — asserted by test), `aiClient.ts` (Anthropic
wrapper, never throws, single discriminated result), `spendGuard.ts` (in-app daily cap on top of the
console-side cap on the sandbox key), `reasonVerdict.ts` (orchestrates cap check → call → span
validation, dependency-injectable for tests), `mergeVerdict.ts` (escalate-only merge — a deterministic
`contains` can never be touched by AI input; `unknown` or an unverifiable span becomes `unresolved`,
never silently `clear`; an AI failure downgrades an otherwise-safe verdict to `unable_to_confirm` but
changes nothing once something's already unsafe), `explainVerdict.ts` (fixed template, not a second
model call), then wired the whole thing into `POST /scans` behind the Path B trigger condition.

**Redesigned mid-build:** `mergeVerdict`'s first cut used a coarse `source: "deterministic"|"ai"` on
each allergen — discovered while wiring the client that this would have thrown away the existing
tag/ingredients/trace distinction the verdict card already renders for every non-Path-B scan, not
just Path B ones. Fixed to carry the deterministic `source`/`matched` fields through unchanged and
add a separate `aiEscalated` boolean instead. Worth remembering: a merge type's shape should be
checked against what actually renders it before writing the tests for it, not after.

**Verified for real, not just `tsc`:** 40 `node:test` cases (span validator, prompt builder, fake-
client-injected `reasonVerdict`, `mergeVerdict`'s full classification × finding-outcome matrix,
`explainVerdict`) — first test infra in this repo, `node --test` built into Node 22, no new
dependency. Then real-system checks: migrations applied against local Postgres and schema inspected;
`callAi()` confirmed at runtime to fail closed without a network call when no key is configured;
`underDailySpendCap()` confirmed against real inserted rows (true under cap, false once exceeded,
cleaned up after); the whole route hit with curl against real Open Food Facts data — a real Path B
product (Diet Coke, no structured allergen tags) with a test "Aspartame" allergen stayed
`contains_allergen` even though the AI call failed closed (rule 4), the same product against a
Milk-only profile correctly became `unable_to_confirm` rather than `safe` (rule 1), and a Path A
product (Nutella, has structured tags) confirmed byte-for-byte unchanged behavior — no Path B trigger,
no `verdict_explanations` row written. Then the client changes were checked in an actual browser
against the actual running app: registered a user, built both profiles, scanned Diet Coke both ways,
watched "Contains an allergen — Contains Aspartame." and "Unable to confirm — No listed allergens...
were found" render correctly on the real verdict card. All test data cleaned up after each pass.

**Known gap, stated rather than hidden:** no `AI_API_KEY` exists in this environment, so every check
above exercises the fail-closed path — the actual "model finds something the keyword matcher
missed" path (an AI call that returns real findings, gets span-validated, and escalates a `clear`
allergen) is structurally unverified so far. This is the one remaining gate before Path B is done,
not an optional follow-up: a real scan against the deployed server with a real sandbox key, looked at
together, next session.

**Next:** the live-key smoke test above, then Week 8's overrule loop once Path B is confirmed for
real. The label-photo path (C) and cross-reference reconciliation (D) stay out of scope until then.

---

## 2026-09-10 (later) — The live smoke test: the AI call had never once succeeded in production

**Did:** Ran the required live-key smoke test from the previous entry. It failed on all three
scans — not the escalation-not-yet-proven kind of failure, the kind that means Path B's `reasonVerdict()`
had never actually completed a real model call in production, at all, despite passing 40+ unit
tests and every fail-closed check done with no key configured.

**What made this findable:** the first deploy of this session's code (`e1b1ec6`..`c8c24ce`) reused
`AI_API_KEY` correctly and the app booted fine, but every Path B scan against the real deployed
server returned `unable_to_confirm` where a working key should have produced `safe` (Diet Coke,
nothing to find) or an escalation (a Coffee-Mate creamer whose ingredients name "sodium caseinate"
with no structured allergen tags and no literal word "milk" anywhere — a genuine miss for the
deterministic matcher, confirmed against the real product data before ever touching the live key).
JT ran the model directly from the box with the exact key and model ID from `.env` — real 200,
real completion — which ruled out the key, the model name, credit, and outbound network in one
step, and pointed squarely at "the failure is in our code."

**First wrong turn, corrected on the spot:** re-reading `env.ts` surfaced a real bug —
`process.env.AI_DAILY_SPEND_CAP_CENTS ?? 200` doesn't fall back for an empty string, only for
`undefined`, and `.env.example` ships that var as a bare blank `KEY=` line, which is exactly what
copying the template would produce. Flagged it as the "leading suspect," fixed it
(`parseOptionalCents()`, 6 tests pinning the exact bug class), and got called on it directly: JT
checked the box first — the var wasn't blank, it was *absent* from the file entirely, and
`undefined ?? 200` already resolves to `200` correctly. The fix was real (a genuinely different env
var left blank elsewhere would still hit it) but it was not the cause of this incident, and saying
so plainly instead of letting the fix quietly stand in for a diagnosis was the right call — this
gets written down explicitly *because* it would have been easy to let a real, deployed fix look like
an explanation it wasn't.

**The actual diagnostic gap:** `aiClient.ts` caught every failure — auth errors, timeouts, a
response that didn't match the schema — into a bare `{ ok: false }` with nothing logged anywhere
and no reason stored in `verdict_explanations`. Three failed production scans and there was
nothing in the database or the logs that said why. Fixed that first, deliberately before chasing
the root cause further: real `APIError`s now log status/type/body and map to `api_error_<status>`;
a schema-invalid response logs the actual content instead of discarding it; `failureReason` threads
through `reasonVerdict()` and is stored on `verdict_explanations` via a new column. Verified against
the real Anthropic API with a deliberately invalid key (confirmed a genuine 401 gets logged in full
and mapped to `api_error_401`) before this was ever pointed at the real incident.

**Root cause, found immediately once that logging existed:** redeployed, re-ran the scan,
`failure_reason = api_error_400`, `tokens null` — rejected at request validation, before any
inference. JT reproduced the app's exact tool schema with a raw `curl` from the box using the real
key, got Anthropic's own error back: `"tools.0.custom: For 'object' type, 'additionalProperties'
must be explicitly set to false"`. `FINDINGS_TOOL` in `aiClient.ts` sets `strict: true` but never
sets `additionalProperties: false` on either of its object schemas (the root, and `findings.items`)
— strict mode requires it on every object node, not just the top level, and rejects the whole
request if even one is missing. **The AI call had never once succeeded in this app, in any
environment, for the entire time Path B existed.** Confirmed the exact fix worked by replaying the
corrected schema against the live API first (200, real tool_use response) — *before* touching the
code, so the fix was known-correct rather than hoped-correct by the time it landed.

**Fixed:** `additionalProperties: false` added to both object schemas, `strict: true` kept (it's
what stops the model inventing fields outside the schema — worth more than the two lines it costs).
Added a test that walks `FINDINGS_TOOL.input_schema` recursively and asserts every object node sets
`additionalProperties: false` — not a hardcoded check of today's two spots, because a schema node
added later without it would reproduce this exact incident silently again. Verified the test
actually catches the regression it's meant to catch, twice: once by reverting the whole fix
(import failure — `FINDINGS_TOOL` wasn't exported yet either) and once by stripping just the two
`additionalProperties: false` lines while keeping the export, which failed the assertion directly
with the exact offending schema node in the message.

**Learned, the part worth keeping:** the whole suite passed the entire time this bug existed —
50 tests, including a hand-rolled fake AI client in `reasonVerdict.test.ts` that never once
validated the real schema against the real API's actual rules, because it didn't need to; it just
returned whatever `AiClientResult` the test told it to. A mock that returns exactly what you tell
it to can prove your merge logic is correct while proving nothing about whether the real request
this code sends would ever succeed. That gap — not any individual line of code — is the actual
lesson here. It's also *why* the live-key smoke test was made a required, non-optional gate for
this slice rather than an afterthought: no amount of unit-test coverage was ever going to catch a
request the API itself rejects before inference, because the boundary between "our code" and "their
API" is exactly the boundary unit tests can't see across. And the diagnostics-first-before-guessing
sequencing mattered concretely, not just philosophically — the empty-cap fix would have shipped as
an unverified "probably fixed it" if the logging fix hadn't gone in first and immediately proven it
wrong.

**Next:** Path B is now confirmed working end to end against the real deployed app with a real key
— the escalation case is still worth re-running once more to see a real `contains_allergen` from a
genuine AI finding (not yet observed, only the fail-closed and deterministic-only paths were seen
before this fix). Then Week 8's overrule loop.

---

## 2026-09-10 (still later) — Re-ran the escalation after the fix, and the AI found a real defect in the matcher itself

**Did:** Redeployed with the corrected tool schema and re-ran the exact same scan that had been
failing (French Vanilla Coffee Mate, barcode `0050000328420`, Milk/severe on the judge's test
profile). It worked, for the first time:

**Before** (deterministic matcher alone, `matchAllergen("Milk", ...)` against this exact product's
real ingredient text): `{ matched: false, source: null }`. Silent — the profile card would have
read "safe."

**After** (Path B, real Anthropic response): `verdict: "contains_allergen"`, `aiEscalated: true`,
`citedSpan: "sodium caseinate"` (a real verbatim substring, passed span validation), `reason:
"Caseinate is a milk-derived protein product made from milk casein. It is a direct milk derivative
and clearly indicates the presence of milk in the product."` Saved as
`docs/evidence/path-b-escalation-scan.json`. This is the first real evidence the whole point of
Path B — resolving a term the deterministic matcher structurally cannot — actually works, not just
in unit tests against a fake client, but against a real model reading a real, messy ingredient list.

**Then the more important part:** the AI didn't just produce a correct answer for this one scan —
it surfaced a genuine, permanent defect in the deterministic matcher, the layer this whole app calls
"ground truth." `matchAllergen`'s `\bkeyword\b` regex requires a keyword to appear as its own word
token; it silently misses any real ingredient term where the keyword is embedded as a prefix or
suffix of a single compound word with no space, because there's no regex boundary between two word
characters. "casein" is a prefix of "caseinate" with nothing between them — miss.

Audited the rest of `synonyms.ts` for the same bug class rather than patching just this one case.
Every addition below was confirmed against real ingredient text from a real Open Food Facts product
first — via the search API, then `matchAllergen()` directly on the isolated ingredient string — not
added on the strength of "this seems like a real word." Two early checks (`eggnog`, `buttermilk`)
were caught with confounded test strings on the first try — the real product's own ingredient list
happened to *also* separately mention the base word — and had to be re-tested in isolation before
they counted as confirmed:

| Term added | Cluster | Confirmed via |
|---|---|---|
| `caseinate`, `caseinates` | Milk | barcode `0050000328420` itself |
| `buttermilk` | Milk | real buttermilk pancake mix ("buttermilk powder") |
| `soymilk` | Soy | real "Organic Unsweetened Soymilk" ("organic soymilk (filtered water...)") |
| `crabmeat` | Crustacean | real "imitation crabmeat" in a seafood salad |
| `eggnog` | Egg | real gelato ("Eggnog (milk, cane sugar, egg yolks...)") |
| `bisulfite`, `bisulphite` | Sulfite | ~15 real citrus juices ("sodium bisulfite (preservative)") |
| `metabisulfite`, `metabisulphite` | Sulfite | real trail mix ("sodium metabisulfite [as preservative]") |
(each singular addition above paired with its plural form in the actual keyword list)

**Checked but not added — no real product found to confirm it, stated rather than guessed:**
`milkfat` as a single compound word. Plausible (it's a real dairy-labeling term), but every search
attempt came back empty, so it's a documented open gap, not a fix. Also noticed, but a different bug
class entirely (missing vocabulary, not a boundary-matching miss — the words don't share a
substring with anything already in the list): `lactalbumin`, `lactoglobulin`, `lactoferrin`,
`albumen`. Real dairy/egg derivative terms, worth a future pass, deliberately not folded into this
one since they're not the same defect.

New `server/src/matcher/match.test.ts` (the matcher had no tests before this session's test infra
existed) — one case per confirmed fix, each using the real isolated ingredient text, plus a
regression check that an unrelated product (Diet Coke) is still a clean miss. 57/57 passing across
the whole suite.

**Learned:** this is the actual value case for Path B that the spec's own framing (`docs/verdict-
engine.md`: "the dangerous failure isn't a missing record, it's a record that says safe about a
product that's wrong") was written for — except it showed up one layer down from where the doc
expected it. The AI didn't just paper over a gap in *Open Food Facts's* data; it exposed a gap in
*our own* ground-truth layer, on a real product, and closing that gap makes every future scan of a
product mentioning "sodium caseinate" — Path A, B, or deterministic-only — correct, not just this
one AI-assisted scan. Fixing the demo case would have been the wrong scope; fixing the actual defect
is what makes the demo worth anything.

**Next:** Week 8's overrule loop. The `milkfat` gap and the missing-vocabulary items above are noted
for a future pass, not blocking.

---

## 2026-09-10 (still later) — Week 8, part 1: the overrule loop's recording path

**Did:** Planned before writing anything (`docs/legacy-spec.md` §6 already had the design —
asymmetric corroboration thresholds, a required photo, three correction types — the rebuild's job
was extending it so a correction can target the AI verdict specifically, per
`docs/verdict-engine.md` and `CONTEST_RULES.md` §3). Confirmed scope with JT before building:
"applies to their profile immediately" gets a real read-side hook this pass, not deferred, but must
never silently change a verdict — the original and the effective, corrected result ship together,
always.

**Built:** `product_corrections` table; `recordCorrection()` (direction from correction type,
`target`/`verdict_explanation_id` derived from whether the disputed allergen was `aiEscalated` on
that scan — never trusted from the caller — verdict/model/prompt version/source text denormalized
at write time per `docs/principles.md`'s N17 precedent); photo storage with real content-type
validation (file signature, not the client's Content-Type header or filename) and a size cap — the
first endpoint in the app that accepts a file from a user, and a required photo field is the first
place someone can fill the disk, so both got hardened rather than just wired up; the POST/GET
routes; a read-side hook in scan history computing an effective result from the requester's own
corrections; and the client — a report affordance on the live verdict card, a transparency callout
on scan history.

**Caught mid-build, before it shipped:** the corroboration anti-inflation protection almost had the
same class of bug the empty-string spend cap did a few hours earlier — a single `UNIQUE(barcode,
allergen, direction, reported_by)` constraint looks right but doesn't actually protect
`wrong_product` reports, because `allergen` is always NULL for that type and standard SQL treats
NULL as distinct from itself in a unique constraint. Caught this by working through what the
constraint would actually enforce before applying the migration, not after — split into two partial
unique indexes instead (one for `allergen IS NOT NULL`, one for `allergen IS NULL`), and then proved
it with real inserts: a second `wrong_product` report from the same user on the same barcode
correctly rejected, a different allergen or a different user correctly allowed.

**Verified for real, every layer:** the migration's constraints tested with real conflicting
inserts, not just applied; `recordCorrection`'s corroboration math tested against real Postgres (the
asymmetric threshold, the "warning survives" conflict rule, independent buckets per allergen);
photo storage tested with real file I/O (real magic bytes written, read back, byte-compared); the
routes tested end to end against a real running server — a real multipart upload, the file
byte-identical on disk and on download, every rejection path for real (oversized, spoofed
content-type declared `.jpg` on a text file, missing photo, malformed `wrong_product`+allergen
combo), a second uninvited user correctly getting 404 (not 403) on both read and write. Then the
whole loop in a real browser: reported a real correction through the real UI with a real uploaded
photo, watched "Reported — thanks. This is now in the review queue." render, then watched scan
history show "Safe" as the headline with "Originally **Contains an allergen** — changed because of
your report" and the specific claim underneath — the exact transparency `legacy-spec.md` §6 requires,
not just a number that quietly changed.

**Decided against, on purpose:** an admin-moderation UI for the review queue, `product_confirmations`
(the positive signal), corroboration changing what a *different* profile sees on a future scan of
the same barcode, and the AI accuracy page. All real Week 8 items, all deliberately staged for a
later pass — the recording path was this week's actual priority, since the accuracy number the
whole bonus is graded on needs months of real scans to mean anything regardless of when the display
side ships. Documented as an explicit, known scope limit in `recordCorrection.ts` rather than
pretending the loop is closed: a remove_caution bucket won't corroborate while a corroborated
add_caution already exists for the same allergen ("the warning survives"), but the reverse isn't
handled yet, and it's safe only because nothing yet reads corroboration status to affect anyone but
the original reporter.

**Next:** part 2 — corroboration propagating to other profiles' future scans, then the accuracy
page (`aiAccuracyReport()`, overrule rate overall and by prompt version).

---

## 2026-09-10 (still later) — A live bug in UPLOAD_DIR, found by checking the box, not the comment

**Did:** JT checked `~/circlebite/.env` on the box after the overrule-loop deploy. No `UPLOAD_DIR`
line at all — meaning production had been running on `env.ts`'s default the whole time this feature
was live, not the override the code comment claimed it needed.

**The bug:** that default was `path.join(process.cwd(), "uploads")`. Absolute path, looked fine.
But `process.cwd()` for the systemd service is whatever `WorkingDirectory` sets
(`scripts/circlebite.service`: `~/circlebite/current/server`), and `current` is exactly the symlink
`scripts/release.sh` repoints to a new release on every deploy. So the default resolved to
`~/circlebite/current/server/uploads` — *inside* the versioned release tree, not outside it. Every
correction photo submitted on production was one deploy away from becoming unreachable the instant
`current` got repointed, not eventually when an old release got pruned. Correction photos are
required evidence for corroboration — this was a live, silent path to losing exactly the evidence
the whole feature exists to keep.

**What actually caught it:** not a test, not a code review — JT reading the real file on the real
box and asking "what does this actually resolve to" instead of trusting the comment that said
production "must" override the default. The comment was correct in intent and wrong in effect: the
override was never actually made, and nothing enforced that it had to be. Verified the resolution
chain precisely before touching anything (`scripts/circlebite.service`'s `WorkingDirectory`, no
`process.chdir()` anywhere in the codebase to override it) rather than assuming.

**Fixed, in order — deliberately, not both at once:** JT set `UPLOAD_DIR` on the box and confirmed
the directory existed *first*, specifically because shipping the `env.ts` hardening before that
would have made the app refuse to boot and taken the site down. Only then: `uploadDir:
required("UPLOAD_DIR")`, no default, same pattern as `DATABASE_URL`/`SESSION_SECRET`/
`OFF_USER_AGENT` — a missing correction-photo path now fails loudly at startup instead of silently
picking a dangerous one. Verified both directions for real: booted with `UPLOAD_DIR` unset locally,
watched it throw `Missing required environment variable: UPLOAD_DIR` and exit 1; restored it,
watched `/health` come back clean. `docs/server-setup.md` §8's bootstrap block and `.env.example`
both updated so a rebuild from that runbook sets `UPLOAD_DIR` in the same step it creates the
directory — can't reproduce this gap by doing one without the other.

**Learned:** the local-dev-only "defaults to X, fine for local dev only" comment style — used twice
now in this file (`AI_DAILY_SPEND_CAP_CENTS`'s blank-string bug earlier today, now this) — is a real
pattern worth naming: a comment describing what production *should* do is not a guarantee about
what it *actually* does, and the gap between those two only closes by checking the running system,
not by re-reading the comment more carefully. Worth an explicit pass at some point over every
`env.ts` default with the same question JT just asked: what does this actually resolve to on the
box, right now, today — not what the comment claims.

**Next:** same as the previous entry — Week 8 part 2.

---

## 2026-09-10 (evening) — Week 8 part 2: community corrections reach other profiles

**Did:** Corroborated "this allergen is in here" reports now change what *other* families see when
they scan the same barcode — the half of the overrule loop that makes it a community loop rather
than a private note. `applyCommunityCorrections()` is pure and escalate-only by construction (it can
only ever set "contains"); `loadCommunityAdditions()` reads corroborated additions in one query per
history page; both scan routes layer the result on top of the engine's verdict. Built from a Cowork
session editing this repo directly, not Claude Code — same rules, same commit discipline.

**Decided:** *Additions only.* JT's call when asked what a corroborated removal should do to
everyone else: it keeps changing only the reporter's own view. Signup is open to any adult, so the
3-report threshold is three throwaway accounts away from clearing a peanut warning for every family
in the app. Removals wait for a review queue. Added to the precedent table in `docs/principles.md`.

Also decided, all for principle 4 (reversible before it ships): `scans.result` is never overwritten —
the community layer is applied on read, so the `COMMUNITY_CORRECTIONS` kill switch reverts every
view with no data change, and the AI accuracy report still measures the engine. It ships **off**.
One bad report can be undone by marking it `rejected`. Each scan records which reports it applied
(`community_corrections_applied`). Runbook in `docs/server-setup.md` §11. History reads reports
fresh rather than from that snapshot, because a warning reported after someone bought a product is
exactly what they need to see when they look back at it.

Profile allergen names are free text, so "Peanuts" on one profile has to reach "peanut" on another.
Rather than a new normalizer, the matching reuses the deterministic matcher in both directions,
which gets the tree-nut umbrella right both ways and inherits its word boundaries ("Fish" never
reaches "Shellfish").

**Found along the way:** a fail-open in the reporter's own view. `applyUserCorrections()` recomputed
the verdict from the per-allergen list alone, so on a product the lookup never found (empty list) or
after an AI failure (all "clear"), a single "this isn't in here" report flipped the reporter's view
from unable-to-confirm to **safe**. Fixed first, in its own commit, with tests for both sources.

**Verified:** full server suite (111 tests) against a real Postgres 16 with all 16 migrations, plus
an end-to-end script against the compiled server: a report on one family's scan escalated a second
family's differently spelled allergen while the stored engine result stayed "safe"; a severe_only
follower saw neither the moderate allergen nor its name in the note; three corroborated removals did
not clear wheat for a fourth family; rejecting the report and turning the switch off each reverted
new scans and history at once; `COMMUNITY_CORRECTIONS=true` refused to boot.

Then checked in a real browser against the local dev server, with invented families: the second
family's card and history both showed the escalation, the shopper-sourced label, and the original
verdict alongside. That check caught two wording bugs no test would have — "other shoppers
reported" for one shopper, and "sesame seeds is in this product" on a plural name — fixed before
deploying.

**Deployed** (release `20260911002055`, migration 0016 applied, `/health` green) and switched on in
production per `docs/server-setup.md` §11. The first deploy attempt couldn't even connect: SSH timed
out because the security group only allows port 22 from the IP it was set up from, and that had
changed. Updating the rule to the current IP fixed it — worth remembering the next time a deploy
"hangs" from a new network.

**Next:** the AI accuracy page. The review queue is the prerequisite for ever letting removals
propagate.

---

## 2026-09-10 (later still) — Week 8: the AI accuracy page

**Did:** Planned the page with JT first — what "overrule rate" means precisely, what breakdowns it
needs, who can see it, and how it stays honest on a handful of real scans — then built it in small
commits. The rate is scoped to `(scan, allergen)` pairs where `aiEscalated` is true (the same flag
`recordCorrection.ts` already uses to route a dispute to `target: "ai_verdict"`), narrowed further
to `direction = 'remove_caution'` — someone saying the AI wrongly added a caution or contains
finding, the false-alarm sense of "overrule." "Unresolved" escalations (uncertainty the AI raised
but couldn't resolve) are counted separately from positive contains/caution ones throughout.

Two things the rate structurally can't see got their own counts instead of being folded in:
reported misses (a `flag_missing` report on an AI-reviewed scan, for an allergen the AI never
escalated — no rate, since there's no way to know how many real misses went unreported) and AI call
failures by `failure_reason`. The page states outright, in its own copy, that the overrule rate
can't see misses.

Small-sample honesty: raw counts always render; a percentage only renders once its denominator
reaches 20 (arbitrary, documented, not a statistical claim) — below that it's "X of Y overruled —
too few for a meaningful rate yet," never a bare, over-precise percentage on n=2.

Added `users.is_admin` — a single boolean, not a role table — to gate the page, since nothing today
needs more than that distinction. No UI sets it; flipped by hand via SQL, same pattern as
`product_corrections.status`, documented in `docs/server-setup.md` §12. `assertIsAdmin` follows the
existing `authorization/` convention (throw, called in the handler) and returns 404 rather than
403, matching `assertCanReadProfile`'s reasoning that a gated route should look like it doesn't
exist.

**Decided:** Not granting `is_admin` to the judge account. With a small user base, the by-allergen
breakdown can effectively identify a specific person's allergy — the same signup-is-open reasoning
that already kept community removals from propagating. Added to `docs/principles.md`'s precedent
table. Also decided `isAdmin` belongs on the user object everywhere identity is returned (register,
login, and `/me`), not only `/me` — `AuthContext` sets user state directly from login/register's own
response on the fast path, skipping a redundant `GET /me`, so a narrower change would have left an
admin's own nav item stale/missing until the next page load.

**Verified:** the new `aiAccuracyReport()`/`assertIsAdmin` logic against real Postgres (124 server
tests passing), then the whole path against the local dev server and a real browser with two fresh
accounts — a non-admin gets a plain 404 from the API and a generic "Couldn't load this page" from
the client, an admin (flipped by hand) sees the real report, and the "AI accuracy" nav link is
present only for the admin account.

**Next:** the review queue — browsing corrections and rejecting one from the UI instead of SQL, and
the prerequisite for ever letting corroborated removals propagate.

---

## 2026-09-11 — Login/register rate limiting, open since Week 1

**Did:** Planned with JT first, in detail — the numbers were the whole point of the planning pass,
not an afterthought. Login gets three independent tiers rather than one: `ip_and_email` (5
failures/15min — one attacker guessing one account), `ip` (20/15min — one source spraying many
emails), and `email` alone (50/60min, deliberately wide and long). JT caught the actual bug in my
first draft before any code existed: a lone tight per-email threshold would let anyone lock out any
account — including the judge account — with a cheap loop of wrong passwords from rotating IPs. The
`email`-alone tier exists specifically to need a real distributed attempt, not a five-request
prank. Register has no secret to guess, so every well-formed submission counts regardless of
outcome, toward its own `ip` (10/60min) and `email` (5/60min) tiers.

Built in small commits: the `auth_attempts` table, `rateLimit.ts` (tested against real Postgres,
including the specific scenario the three-tier design exists for — 50 failures against one email
from 50 different IPs trips the per-email tier even though no single IP or IP+email pair ever
reaches its own threshold), `app.set("trust proxy", "loopback")`, then wiring into `/auth/login`
and `/auth/register` separately, then the client message.

**Decided:** Store HMAC-SHA256 hashes of IP and email in `auth_attempts`, not the raw values
(`docs/principles.md` principle 5) — the limiter only ever needs equality against the same value
again. Reused `SESSION_SECRET` rather than adding a second secret purely for this, domain-separated
by an `"ip:"`/`"email:"` prefix, same pattern `auth/session.ts` already uses for session tokens.
Also decided the sliding-window design accepts a known, named tradeoff rather than hiding it: a
persistent low-rate attacker can keep a specific email's window "hot" indefinitely (a real category,
"account-lockout DoS") — the standard fix is a CAPTCHA/step-up challenge, which usually means a
hosted service and is more scope than "slow down brute force" calls for here.

**Hit a wall on:** My own first draft of the verification plan for `trust proxy` was wrong, and JT
caught it before I wrote a line of code — I'd proposed sending a spoofed `X-Forwarded-For` directly
to the local dev server and confirming it got rejected. That would have proven nothing: Node only
ever accepts connections from `127.0.0.1` on this box, so a local request's socket peer genuinely
*is* loopback, and `trust proxy: "loopback"` trusts it *by design* in that case. The real check has
to go through the live nginx — sending a forged header to `https://circlebite.app` and confirming
the IP nginx's own `$proxy_add_x_forwarded_for` appended is what got recorded, not the forged one.
Documented as its own check in `docs/server-setup.md` §13, computing the spoofed value's hash on the
box rather than reading a value back (the table only ever stores hashes).

**Verified:** 133 server tests passing (9 new, all against real Postgres). Then the local dev server
end to end: the 6th wrong password in a row against a fresh account returns 429, and so does the 6th
attempt with the *correct* password while that window is still tripped — the accepted cost of
throttling brute force at all is a brief self-lockout risk for the real owner. Register's per-IP
tier tripped identically at the 10th well-formed attempt regardless of outcome. Both pages
browser-checked for the client message: tripped each limiter for real through the actual fetch path
and confirmed "Too many attempts. Try again in 15 minutes." renders on the real 429, not a mocked
one.

**Not yet deployed** — everything this session was run and verified locally, same as the auth layer
originally shipped in Week 1. The `trust proxy`/nginx verification in server-setup.md §13 can only
run against the live site once this reaches it.

**Next:** the review queue.
