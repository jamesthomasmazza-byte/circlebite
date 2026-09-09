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
