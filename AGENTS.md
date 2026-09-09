# Instructions for AI assistants working in this repository

This repository is a **contest entry** with rules that override normal engineering defaults.
Read `CONTEST_RULES.md` before proposing, generating, or changing anything. It is the source of
truth until judging ends (week of November 26, 2026).

## Before you suggest anything

Check the proposal against `CONTEST_RULES.md` §1. If it violates a hard constraint, say so and stop —
do not implement it and mention the problem afterward.

## Never, in this repository

- **Never add a hosted backend service.** No Supabase, Firebase, PlanetScale, Neon, managed auth
  (Clerk, Auth0), or managed queues. PostgreSQL runs on the project's own EC2 instance. This is R6,
  restated in the professor's written approval — it is the fastest way to lose eligibility.
- **Never commit a secret.** No `.env`, no API keys, no `.pem`, no credentials, in any file or any
  commit. Use `.env.example` with empty values. If a secret reaches a commit, say so immediately —
  the key must be rotated, not just removed.
- **Never suggest a no-code or low-code platform**, or scaffold from one. Lovable is named in the
  rules as disqualifying. This repo replaces an earlier Lovable prototype (see below).
- **Never squash, rebase, amend, or force-push published history.** The commit history is graded
  evidence that the app was built iteratively over the semester. Rewriting it destroys the evidence.
- **Never write real personal data** into seeds, fixtures, tests, or screenshots. Allergy profiles are
  health information, often about children. Invent everything.
- **Never dump a large amount of code in one commit.** See the commit rules below.

## Commit discipline — this is graded at 15%

- One logical change per commit; small and frequent beats large and rare.
- Descriptive imperative messages: `Add allergen severity to profile form`, not `Changes` or `WIP`.
- Commit as work completes, spread across the semester. A quiet week followed by forty files in one
  commit reads to a judge exactly as it looks.
- Never generate a batch of commits with backdated timestamps.

## The stack is fixed

TypeScript — React on the front end, Node on the server, PostgreSQL self-hosted. This was granted as
a **written exception** to the contest's default Laravel requirement. Do not propose changing
frameworks, and do not add a dependency that reintroduces a managed service.

## When touching the AI verdict engine

See `docs/verdict-engine.md`. Non-negotiable, from `CONTEST_RULES.md` §3:

- The system **fails closed** — any error, timeout, unparseable response, or low confidence yields
  `unable_to_confirm`, never `safe`.
- The model may escalate a verdict or resolve an unknown. It may **never** clear an allergen the
  deterministic matcher found.
- Every model claim cites a verbatim span of the source text. Validate the span exists in code;
  discard findings that fail.
- Prompts carry allergen names and severities only — never a person's name, profile label, or age.
- Store model name, prompt version, and exact input alongside every verdict.
- The disclaimer renders on the verdict card itself.

## Relationship to the older project

An earlier prototype of this app was built on Lovable, in a separate repository, before the contest
opened. It was disclosed to Prof. Yoest and cleared. **No code, commits, or generated files from that
project may be copied into this repository.** Its schema and product decisions may be used as
reference and re-implemented from scratch — that is the approved arrangement.

## Scope discipline

The contest deliverable is a web app behind a login. iOS/Capacitor, circle sharing, and broad admin
analytics are explicitly out of scope until after judging (`CONTEST_RULES.md` §7). If asked to build
one of those before judging, note that it is out of scope and confirm before proceeding.
