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
