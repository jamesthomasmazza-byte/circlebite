# Build journal

One short entry per working session. This exists for three reasons:

1. The judging deliverable requires a one-page summary including **what you learned** — that is
   written from this file, not from memory in November.
2. It gives a new Claude Code session context on where things stand without re-reading the codebase.
3. It is honest evidence of an iterative build, alongside the commit history.

Keep entries short. What you tried, what broke, what you decided, what's next. Write it at the end
of a session, not the beginning.

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
