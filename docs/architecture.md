# Architecture

A container-level view of CircleBite as built: who uses it, which modules do the work, and where
data crosses a boundary. It is a reading aid for the rest of `docs/` — `verdict-engine.md` for how
a scan becomes a verdict, `principles.md` for why the safety-relevant calls were made the way they
were, `server-setup.md` for what runs on the box.

![CircleBite container diagram](./architecture.png)

## What the picture is saying

Four groupings, matching how the code is organized rather than how a user moves through it:

- **Client Experience** — React screens, all of them reaching the server through one API client
  (`client/src/lib/api.ts`). No screen talks to the server any other way.
- **Identity And Circles** — the Express app and the routers that own accounts, profiles, and the
  circle (co-managers and followers, with share levels).
- **Scanning And Verdicts** — the path a barcode takes: product lookup, the deterministic allergen
  matcher, then the AI reasoning path for what the matcher couldn't resolve, with span validation
  on every citation and a stored explanation for every verdict.
- **Corrections And Oversight** — the overrule loop. Reports from circle members, the corroboration
  rules that decide whether a report changes what anyone else sees, the admin review queue that can
  reject one, and the AI accuracy page.

Two external dependencies, both read-only from the app's side: Open Food Facts for product data,
and the Anthropic API for the reasoning path. Everything else — Postgres, the label photos, the
session store — runs on the project's own instance, per `CONTEST_RULES.md` R6.

## Logic in the database: the profile change history

Everywhere else, behaviour lives in TypeScript, and migrations hold schema only. The one exception
(Oct 6, 2026) is the profile change history (migrations 0036–0039). It's written by plpgsql
triggers on `allergens`, `allergen_profiles` and `product_corrections`, and an append-only guard
protects it. Not in the diagram above.

Why the history doesn't live in the routes: it has to be impossible for it to disagree with what
happened. A trigger writes each entry from the actual row, in the same transaction as the change,
for every write path, including ones that don't exist yet and a psql session on the box. An app-level
helper is only as complete as the list of callers someone remembers to update.

What it costs, so nobody rediscovers it the hard way:

- **A trigger error blocks the parent's edit.** The triggers are written so they can't fail
  (see 0036's header). If one fails anyway, `server-setup.md` §18.3 disables them in one command.
- **The app passes its acting user to the database** through `server/src/lib/withActor.ts`
  (a transaction-local `circlebite.actor_id`). A write made outside `withActor` is still
  recorded, with no actor ("made outside the app").
- **Logic hidden from a TypeScript reader.** Grep the migrations as well as `src/` when a row
  appears that no route wrote. A new plpgsql trigger needs the same case: a guarantee the app
  layer can't give.

## Caveats

- **A snapshot, not generated output.** Dated 2026-09-20, at the point the review queue shipped.
  Nothing regenerates it, so treat it as a map rather than a source of truth, and check it against
  the code before relying on a detail.
- One known inaccuracy: the diagram shows the review screen submitting decisions straight to the
  Express app. It doesn't — like every other screen, it goes through `api.ts`. Fix on the next pass.
