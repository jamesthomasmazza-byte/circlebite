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

## Others

Add references here as they come up, each with the same treatment: the link, what it's good for, and
which specific screen in this app it changes. Candidates worth a look when the UI pass starts:

- WCAG 2.2 AA contrast and target-size minimums — the accessibility bonus (`BACKLOG.md` Week 9) is
  graded, and WCAG is the standard a judge would check against.
- Any allergy or medical-alert app worth studying for how it renders a severity hierarchy.
