# Design references

Collected before the Week 9 UI pass, so the styling work has something to argue against rather than
being invented on the spot. JT picks the references; this file records what each one is for and
which parts actually bind on CircleBite.

The app is a safety tool used one-handed, in a grocery aisle, often in a hurry, sometimes by a
grandparent or a babysitter scanning for someone else's child. Every reference below gets read
through that: the question is never "is this pretty," it's "does this hold up at arm's length in
bad light while holding a package."

## Apple — UI Design Dos and Don'ts

<https://developer.apple.com/design/tips/>

A one-page checklist rather than a system. Short enough to re-read before each screen.

What it says, and where it lands here:

- **Touch targets at least 44×44pt.** The scan button, the camera toggle, the allergen picker in the
  report form, and the profile switcher are all thumb targets on a phone held in one hand. Today
  they're default-sized HTML controls, which are smaller than this on every phone.
- **Put controls next to the content they affect.** The "Report a problem with this verdict" control
  belongs with the verdict card it disputes, not at the bottom of the page.
- **Text no smaller than 11pt, with real contrast.** The verdict card carries an allergy decision.
  Severity labels, the "may contain traces" qualifier, and the disclaimer all have to survive a
  glance — they're the smallest text on the most important screen.
- **Don't let text overlap or crowd; give it line height.** Allergen names, severities, and source
  lines currently run together as one sentence per row.
- **Fit the screen — no horizontal scrolling or pinch-zooming.** Scan history and the accuracy page
  are the two places most likely to break this.
- **Images at their true aspect ratio, high resolution.** Correction photos are label photographs,
  and a squashed one is unreadable evidence.
- **Align things to show what's related.** The verdict, its explanation, its per-allergen list, and
  its disclaimer are one object and should read as one.

Worth knowing: these tips are written for native iOS apps, and the contest deliverable is a web app
behind a login. The physical guidance (target size, type size, contrast, aspect ratio) transfers
directly. The platform-specific parts — iOS controls, @2x/@3x asset pipelines, navigation bars —
don't, and shouldn't be imitated in a browser.

## Apple — Human Interface Guidelines: Design principles

<https://developer.apple.com/design/human-interface-guidelines/design-principles>

Eight named principles — Purpose, Agency, Responsibility, Familiarity, Flexibility, Simplicity,
Craft, Delight. Where the dos-and-don'ts page settles pixel questions, this one settles argument
questions: it's what to reach for when two reasonable layouts both work and something has to break
the tie. Several of them restate, in interface terms, decisions `docs/principles.md` already made
on the product side.

The four that carry real weight here:

- **Responsibility — act in people's best interest; be transparent; collect only what's needed.**
  This is `principles.md` §5 and §7 in Apple's words, and it's the one a judge scoring the ethical-AI
  bonus is effectively grading. The disclaimer on the verdict card, "reported by 2 shoppers" being
  visually distinct from "the label says," and the accuracy page admitting it can't see misses all
  belong to this principle. The UI pass must not quietly flatten those distinctions for tidiness.
- **Agency — help people recover from mistakes.** The overrule loop *is* this principle: a user
  who thinks the verdict is wrong can say so and have it change. Account deletion's typed-email
  confirmation is the same idea from the other direction. Where the UI can't offer a way back —
  deletion, a spent reset link — it has to say so plainly before the click, not after.
- **Simplicity — establish hierarchy; be concise; include just what's necessary.** The verdict card
  is the whole product in one screen and currently reads as a flat list. Verdict, then the allergen
  that caused it, then why, then the disclaimer — in that order, at that priority.
- **Flexibility — design for everyone, accessibility as a priority from the start, and support
  varied input.** Directly the Week 9 accessibility item. Also a reminder that the scanner has to
  work by hand as well as by camera, which it already does — keep manual barcode entry equal in
  the redesign, not demoted to a fallback.

Purpose, Familiarity, Craft and Delight matter less for a contest build on a deadline, with one
exception worth keeping: *don't mistake delight for decoration*. A safety tool earns nothing from
whimsy, and a judge reading an anaphylaxis verdict wrapped in flourish will trust it less.

## Others

Add references here as they come up, each with the same treatment: the link, what it's good for, and
which specific screen in this app it changes. Candidates worth a look when the UI pass starts:

- WCAG 2.2 AA contrast and target-size minimums — the accessibility bonus (`BACKLOG.md` Week 9) is
  graded, and WCAG is the standard a judge would check against.
- Any allergy or medical-alert app worth studying for how it renders a severity hierarchy.
