# CircleBite

**AI Vibe Coding Competition — Busch School of Business, Fall 2026**
Built by JT Mazza (mazzajt@cua.edu) · Individual entry

## Thesis

**The problem.** People with food allergies — and the parents managing a child's allergies — have to
read every ingredient panel of every product, every time, and translate it themselves. Allergens hide
behind names that don't look like allergens: *sodium caseinate* is milk, *albumen* is egg, *E322* is
soy lecithin. Existing scanner apps only work when a product happens to be in a database with clean,
structured allergen tags. When it isn't — an imported item, a bakery package, a store brand — the app
returns nothing, and the person is back to guessing.

**The solution.** CircleBite lets a user build an allergen profile with per-allergen severity, then
scan a grocery barcode for a clear **safe / contains / unable to confirm** verdict. Where existing
tools stop, CircleBite continues: when a barcode isn't in the product database, the user photographs
the ingredients panel and an AI model reads it, reasons about whether the product is safe for that
specific profile, and cites the exact ingredient that produced the verdict.

**How AI does the work.** A deterministic keyword matcher runs first and is treated as ground truth.
The model then reasons over what the matcher structurally cannot resolve — unfamiliar derivatives,
non-English labels, additive codes, and text extracted from a photograph. Every claim it makes must
cite a verbatim span of the source text, validated in code. The model may escalate a verdict or
resolve an unknown; it may never clear an allergen the matcher found, and it never returns *safe* on
low confidence. Every verdict is explained in plain language, and the user can overrule it — each
overrule logged against the model and prompt version that produced it.

**Target user.** Parents managing a child's food allergies, and adults with severe allergies who
currently read every label by hand.

**Success criteria.**

1. A user can register, build an allergen profile, scan a product, and receive an explained verdict.
2. Products missing from the database still produce a verdict, from a photograph of the label.
3. Every AI verdict cites the ingredient that triggered it and can be overruled by the user.
4. The system never returns *safe* when it is not confident.
5. Measured overrule rate is visible in the app, not asserted in a slide.

## Status

Under active development, September–November 2026. Not yet deployed.

## Rules

This repository is governed by [`CONTEST_RULES.md`](CONTEST_RULES.md). AI assistants working here
must read [`AGENTS.md`](AGENTS.md) first.

## Stack

TypeScript throughout — React on the front end, Node on the server, PostgreSQL self-hosted on the
project's own AWS EC2 instance. The TypeScript stack was approved as a written exception to the
contest's default Laravel requirement on September 8, 2026.

## Prior work disclosure

An earlier prototype of this concept was built on Lovable in a separate repository before the contest
opened. It was disclosed to Prof. Yoest in writing on September 8, 2026 and cleared. It is not
submitted, and no code from it appears here. This repository was started from scratch.
