# ClaraBite — contest entry

Read `CONTEST_RULES.md` and `AGENTS.md` before proposing or changing anything in this repository.
They are binding until judging ends (week of November 26, 2026), and they override normal
engineering defaults.

## The three that get this entry disqualified

1. **No hosted backend services.** PostgreSQL, auth, and the API all run on this project's own EC2
   instance. No Supabase, Firebase, Clerk, Auth0, Neon, or managed anything.
2. **No secrets in the repo, ever.** Not in a file, not in a commit, not in history. `.env.example`
   only. If a key reaches a commit, say so immediately — it must be rotated, not just deleted.
3. **No no-code / low-code platforms**, and no code copied from the earlier Lovable prototype.

## Commit discipline — graded at 15%

The commit history is evidence that this app was built iteratively over a semester. Judges read it.

- One logical change per commit. Small and frequent.
- Descriptive imperative messages: `Add allergen severity to profile form`. Never `Changes`, `WIP`,
  or `Update files`.
- Commit as work completes, not in end-of-week batches.
- **Never** squash, rebase, amend, or force-push anything already pushed.
- Never backdate commits.

## Keep the AI attribution on

Commit trailers crediting Claude Code stay in. Visible AI assistance is explicitly rewarded by this
contest, not penalized — the history is meant to show how the app was built.

## Stack is fixed

TypeScript — React front end, Node server, self-hosted PostgreSQL. Granted as a written exception to
the contest's Laravel default (`docs/approvals/`). Do not propose framework changes or dependencies
that reintroduce a managed service.

## Verdict engine

`docs/verdict-engine.md`. Fail closed, model escalates only, every claim cites a verbatim span,
prompts carry no personal data, disclaimer renders on the verdict card. These are requirements.

## Scope

Web app behind a login. iOS/Capacitor, circle sharing, and broad admin analytics are out of scope
until after judging. Say so if asked to build one before then.
