# CircleBite

**AI Vibe Coding Competition — Busch School of Business, Fall 2026**
Built by JT Mazza (mazzajt@cua.edu) · Individual entry

## Thesis

**The problem.** The person eating the food usually isn't the person reading the label. A parent
manages a child's allergies, but the child eats at a grandparent's house, a friend's birthday party,
a babysitter's kitchen — and the adult holding the package in those moments doesn't know that this
kid reacts to trace dairy but not baked egg. Meanwhile allergens hide behind names that don't look
like allergens: *sodium caseinate* is milk, *albumen* is egg, *E322* is soy lecithin. Existing
scanner apps assume one person scanning for themselves, and only work when a product happens to be
in a database with clean, structured allergen tags.

**The solution.** CircleBite. A parent builds an allergen profile for their child with per-allergen
severity, then invites trusted people into that child's circle — grandparents, a babysitter, a
friend's parent. Anyone in the circle scans a grocery barcode and gets a verdict *for that child
specifically*: **safe / contains / unable to confirm**. The person scanning doesn't need to know the
allergies. They need to know whether this food is safe for this kid.

Where existing tools stop, CircleBite continues: when a barcode isn't in the product database, the
user photographs the ingredients panel and an AI model reads it, reasons about whether the product
is safe for that specific profile, and cites the exact ingredient that produced the verdict.

**How AI does the work.** A deterministic keyword matcher runs first and is treated as ground truth.
The model then reasons over what the matcher structurally cannot resolve — unfamiliar derivatives,
non-English labels, additive codes, and text extracted from a photograph. Every claim it makes must
cite a verbatim span of the source text, validated in code. The model may escalate a verdict or
resolve an unknown; it may never clear an allergen the matcher found, and it never returns *safe* on
low confidence.

This matters more in a circle than it would in a single-user app. Someone scanning on a child's
behalf has no intuition to fall back on, so the verdict has to explain itself — which ingredient
triggered it, and why. Any circle member can overrule a verdict, and each overrule is logged against
the model and prompt version that produced it.

**Target user.** Parents managing a child's food allergies, and the ring of people who feed that
child when the parent isn't in the room.

**Success criteria.**

1. A parent can register, build an allergen profile, and invite someone into that profile's circle.
2. A circle member can scan a product and get an explained verdict for a child whose allergies they
   have never memorized.
3. Products missing from the database still produce a verdict, from a photograph of the label.
4. Every AI verdict cites the ingredient that triggered it and can be overruled.
5. The system never returns *safe* when it is not confident.
6. Measured overrule rate is visible in the app, not asserted in a slide.

## Status

Under active development, September–November 2026. Deployed at
[circlebite.app](https://circlebite.app) — placeholder page while authentication is built.

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
