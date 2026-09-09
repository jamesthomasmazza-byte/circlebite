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
