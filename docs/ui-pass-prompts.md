# UI pass — prompts for Claude Code

Five prompts, in order, one per sitting. Written 2026-09-30, before the Week 9 pass.

Starting position: the client has **zero CSS** — no stylesheet, no `className`, one inline `style`
in the whole app. Every screen is browser-default HTML. The markup is semantic, which is the reason
prompt 1 does most of the visible work: styling `h1`, `button`, `input`, `ul` restyles every screen
at once, with no component rewrites.

Paste the standing constraints at the top of each prompt.

---

## Standing constraints (paste with every prompt)

```
Standing constraints for all UI work on CircleBite:

- Read docs/design-references.md first. It records which parts of Apple's guidance bind here and
  which don't, and it was written before any styling existed. Read docs/principles.md too — several
  UI decisions are already settled there on product grounds.
- The context is a grocery aisle: one hand, a phone, bad light, in a hurry, sometimes a grandparent
  or babysitter scanning for someone else's child. Every judgment call resolves toward "readable at
  arm's length while holding a package," not toward "looks good in a portfolio."
- No CSS framework, no component library, no new runtime dependency without asking me first. Plain
  CSS in the existing Vite build.
- Do not change behavior, routing, or any verdict/copy logic in a styling change. If styling
  reveals a behavioral bug, tell me — don't fix it in the same commit.
- Never flatten a distinction the product makes for safety reasons: "contains" vs "may contain
  traces", "the label says" vs "reported by 2 shoppers", label-sourced vs barcode-sourced evidence.
  Tidiness is not a reason to merge them.
- Contest rules bind (CONTEST_RULES.md). No hosted services, no secrets, synthetic data only in
  anything a judge can reach.
- Small commits with real messages, per AGENTS.md. Tests against real Postgres still pass.
```

---

## Prompt 1 — Foundation

Do this one first and alone. It is the highest-leverage change in the project.

```
The client has no CSS at all — no stylesheet, no className, one inline style. Every screen is
browser-default HTML with semantic markup.

Build the foundation only. No per-screen or per-component work in this sitting.

Create a single stylesheet imported once in main.tsx, containing:

1. Design tokens as CSS custom properties on :root — a type scale, a spacing scale, a colour
   palette, border radii, and one shadow. State the intended contrast ratio next to each
   foreground/background pair as a comment, and verify them rather than asserting them.

2. Base element styles that carry the whole app because the markup is semantic: html/body, h1-h4,
   p, ul/ol/li, a, button, input, select, textarea, label, details/summary, table. This is what
   restyles every screen at once.

3. Mobile-first, phone width as the design target, no horizontal scroll at 320px.

Specific requirements, from docs/design-references.md:

- Body text no smaller than 16px (17px is iOS default and reads better at arm's length). Nothing
  below 13px anywhere, including the disclaimer.
- Every interactive control at least 44x44px of touch area, including the profile picker, the
  camera toggle, and any link acting as a button. Use padding to reach it, not a bigger font.
- Inputs at 16px minimum font-size or iOS Safari zooms the page on focus.
- Real line height on body text (1.5) and tighter on headings (1.2).
- System font stack starting with -apple-system so it renders as the platform's own type.
- Safe-area insets honoured: add viewport-fit=cover to the viewport meta in index.html and pad the
  page with env(safe-area-inset-*) so content clears the notch and home indicator.
- A visible :focus-visible ring on every control. Do not remove outlines.
- Dark mode via prefers-color-scheme, with the same contrast guarantees. Verdict colours must stay
  distinguishable in both.
- Respect prefers-reduced-motion for anything you animate.

Colour carries meaning here: safe, caution, contains, and unable-to-confirm are four states a
parent reads in a hurry. Do not encode them in colour alone — each needs a difference in weight,
icon, or wording that survives colour blindness and a sunlit screen. Say in your summary what the
non-colour signal is for each.

Deliverable: the stylesheet, the index.html viewport change, and a short note on what the tokens
are and why. Then show me the scan screen and the dashboard before and after, at phone width.
```

---

## Prompt 2 — The verdict card

The one screen that carries an allergy decision. Do it on its own.

```
Style the verdict card on the scan screen, using the tokens from the foundation pass. This is the
screen the whole app exists to produce — treat it as the most important surface in the project.

Read docs/design-references.md on hierarchy and on the Responsibility principle before starting.

What it has to do:

- The verdict itself readable at a glance, at arm's length. Someone should know safe / caution /
  contains / unable-to-confirm before reading a word of detail.
- The product name and brand clearly subordinate to the verdict, but present — people check they
  scanned the right thing.
- The per-allergen list as a scannable list, not a run-on sentence per row. Today allergen name,
  severity, claim and evidence source all run together. Each row has four facts and they need
  visual separation: which allergen, how severe for this profile, what the package claims, and how
  we know.
- "Contains" and "may contain traces" must not look alike. This distinction was a real bug we
  fixed in copy; don't let styling undo it.
- Evidence provenance visible but not shouting: barcode record, photographed label, or both, and
  when a claim comes from another shopper's report rather than the label.
- The disclaimer present and readable — it is a graded ethical-AI element, not boilerplate to
  shrink into grey 10px text.
- "Report a problem with this verdict" adjacent to the card it disputes.
- The "what we read from your photo" disclosure legible when opened; it is the parent's cross-check
  against the physical package.

Handle all four verdict states and both themes. Do not change any copy or logic — if the layout
exposes a wording problem, tell me separately.
```

---

## Prompt 3 — The scan flow

```
Style the scan flow end to end, and build the two scanner improvements in BACKLOG.md's Week 9
section (the targeting box and the barcode-failure fallback). Read that item first — it leaves one
question deliberately open and explains why.

Scope:

- The camera view: a reticle showing where to hold the barcode, with the live view dimmed outside
  it. If @zxing/browser supports restricting decoding to a region, use it — a smaller decode area
  is faster per frame as well as easier to aim at.
- The fallback when no barcode decodes within an interval: surface the label-photo option without
  taking the scanner away. My lean is an offer on a timer while scanning continues, not an
  automatic switch — barcodes on crushed or curved packaging often read on the third try.
- The waiting states. A combined scan can make up to three Anthropic calls and takes real seconds.
  Right now there is nothing to look at while that happens. Say what is being done, not just that
  something is.
- The label capture form, the adaptive photo prompt, and the manual barcode entry field.
- Error states: camera permission denied, no camera, unreadable photo, network failure, and the
  daily spend cap being hit (which fails closed to unable-to-confirm and currently reads like a
  broken app).

One-handed use is the whole design constraint here: primary controls in thumb reach at the bottom
of the screen, not the top.
```

---

## Prompt 4 — Everything else

```
Style the remaining screens with the foundation tokens: register/login, the dashboard, profiles,
the circle and invite flow, scan history, settings (including the NPS form and the delete-account
danger zone), the admin review queue, and the AI accuracy page.

Consistency is the goal — these should read as one app, not eight. Reuse the patterns from the
verdict card rather than inventing per-screen treatments.

Also in scope, per BACKLOG.md:

- Error and empty states throughout. Every list and every form.
- Scan history and the accuracy page must not need horizontal scrolling or pinch-zoom on a phone.
  Tables are the likely offender — consider a card layout at narrow widths.
- Destructive actions read as destructive. Account deletion is real and permanent.
- The admin review queue is a judge-visible screen and currently the least-designed one.

Do not restyle the verdict card or scan flow — they are done.
```

---

## Prompt 5 — Accessibility and a real device

```
Accessibility and real-device pass. BACKLOG.md marks the accessibility work as a bonus item;
docs/design-references.md explains why it lands harder here than on a typical app.

- VoiceOver on the verdict card specifically: the verdict, the per-allergen rows, and the
  contains-vs-traces distinction must all be conveyed to a screen reader, not just visually. Read
  it aloud and tell me what it actually says.
- Keyboard navigation through every flow, with visible focus throughout.
- Verify contrast ratios with a tool rather than by eye, in both themes, and report the numbers.
- Check that no state is signalled by colour alone.
- Touch targets measured, not estimated.
- Test at the largest Dynamic Type setting — the verdict card must not break.
- Confirm no horizontal scroll at 320px on every screen.

Report findings as a list before fixing anything, so I can see what was actually wrong.
```

---

## After this

The remaining Week 9 items in `BACKLOG.md` — the kill-switch off-state check, the `CONTEST_RULES.md`
§9 compliance pass, the judge seed script — are not styling work and shouldn't be folded into these
prompts.
