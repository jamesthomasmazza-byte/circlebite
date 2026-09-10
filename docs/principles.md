<!-- Brought into the contest repo 2026-09-09 as design reference. Written by JT in August 2026
     during the prototype build; this is his own decision document, not generated project code.
     Two edits from the original: a licensing cost figure and cross-references to a private
     competitive-strategy document were removed, since this repository is public. -->

# CircleBite — Mission and Operating Principles

**Created:** August 15, 2026 · **Purpose:** to settle recurring tradeoffs without re-litigating them.

This is a decision-making document, not a marketing one. Nothing in it is aspirational. Every principle below was reconstructed from a decision already made on this project, and every one names **what it costs** — because a principle that never loses isn't a principle, it's decoration.

Use it as a tie-breaker. When two reasonable options exist and the choice feels arbitrary, the answer is probably already here.

---

## The mission

> **Answer one question accurately: is this specific product safe for this specific person — and make sure everyone who feeds them sees the same answer.**

Two halves, and both matter. The first is the verdict. The second is the circle. A competitor can clone the scanner in a weekend; they cannot clone a grandmother who already accepted an invite.

### What we are not

- **Not a health score.** We don't rate food quality, nutrition or virtue. One question, one person.
- **Not a diagnosis or a guarantee.** A screening aid. The label is the source of truth and we say so, every time.
- **Not a general-purpose food database.** Product data is a commodity anyone can license. Household judgment is not.
- **Not a children's social product.** Adults hold accounts. Children exist as profiles their guardians own.

---

## The principles

### 1. False caution beats false safety

The harms are not symmetric. Wrongly warning someone costs an unnecessary avoidance. Wrongly clearing someone can cost a hospital visit. When a call is genuinely close, resolve toward caution.

**What it costs:** people sometimes avoid food that was fine. Some verdicts look overcautious next to competitors that guess confidently.

**Where it decided things:** corroboration thresholds are deliberately asymmetric — one report to *add* a warning, three to *remove* one. A community report with unknown provenance resolves to "direct ingredient," not "trace." When an addition and a removal conflict, the warning survives.

### 2. Uncertainty is shown, never softened

"Unable to confirm" is a feature, not a failure state. No data means no verdict, and that is never rendered as "probably fine." Most apps hide uncertainty because it looks like weakness. Showing it is the strongest trust signal available to us.

**What it costs:** we look less capable than competitors who always produce an answer. Our coverage numbers read worse because we admit the gaps.

**Where it decided things:** the fourth verdict state exists at all. `unable_to_confirm` distinguishes "barcode unknown" from "no ingredient data." A submitted label photo can never move a verdict toward safe — four independent barriers enforce it.

### 3. The answer is for one specific person

Specificity is the product. Every verdict is scoped to a named individual with their own allergens, severities and cross-contact tolerances. The moment we merge people into one answer, we've rebuilt the generic score we exist to replace.

**What it costs:** more UI, slower reads, no simple shareable number, and a worse first-run experience than an app that just shows a score.

**Where it decided things:** N11 — a multi-profile scan shows one row per profile, never a merged verdict, and the summary line can never read "safe" unless every profile is safe.

### 4. Reversibility before speed, on anything safety-critical

Any mechanism that can change what a person is told must be auditable and undoable *before* it ships, not after. Incidents are survivable. Incidents you cannot explain or reverse are not.

**What it costs:** moderation, audit trails and kill switches get built before features that would grow the product faster.

**Where it decided things:** C3 shipped the immutable audit trail, the admin kill switch and rate limiting before the safe list or data export. The audit table has no UPDATE or DELETE policy for anyone — including the admin — because the record must not be editable by the surface it audits.

### 5. Household data grows. Our data collection stays minimal.

Two different things get called "collecting data," and conflating them is a mistake.

**Data the household owns and benefits from should grow as richly as possible.** Severity notes, cross-contact tolerances, trusted brands, safe lists, "ask me first" products, scan history per circle member. This is the switching cost — the switching-cost argument — and it's an asset. Build more of it.

**Data we collect *about* users, for our own purposes, stays minimal.** Identifiers, behavioural tracking, anything that isn't needed to answer the question in front of us. Every field here is one we must secure, disclose, retain, delete and defend.

The test: *does the person holding this account get direct value from this field existing?* If yes, it's household context — collect it, and make it easy to export and delete. If it only serves us, justify it or drop it.

**What it costs:** the second half genuinely closes doors. A self-managing teenager can't hold their own account. Analytics stay coarser than a growth team would want. Behavioural targeting and personal-data licensing are permanently off the table.

**What it does not cost:** the monetization actually on the table. Subscription monetizes judgment, not data. The corrections corpus is *product* data — N17 makes it larger, not smaller. Institutional buyers in schools and clinics treat a strong privacy posture as a reason to sign, not an obstacle. If a revenue model requires harvesting personal data, it was going to cost more in trust than it earned — and trust is the moat (principle 7).

**Where it decided things:** the 18+ decision — children are profiles, never account holders. The age gate transmits a boolean and never the date of birth. Admin exports drop names and free-text notes while keeping product-level aggregates. N23 flags that child photographs change the privacy posture materially and proposes non-photographic avatars instead. Meanwhile items 7, 8, 20 and 21 all *add* household context deliberately.

### 6. Give away the commodity, keep the judgment

Ingredient strings are a commodity. The proprietary asset is the layer on top: severity-aware, circle-scoped, cross-contact-aware judgment about a specific person — and the corrections corpus that captures what no vendor normalises.

**What it costs:** we don't own the raw data and shouldn't pretend to. Some contributions may have to flow upstream.

**Where it decided things:** the licensing analysis concluded coverage is buyable but judgment isn't, and no vendor sells normalised "may contain" language. N17 requires corrections to be stored as standalone, self-sufficient records rather than patches on someone else's rows. N18 asks counsel whether ODbL share-alike even permits the proprietary-corpus position.

### 7. Trust is earned slowly and destroyed instantly

This category's scarcest asset. Yuka has 80M users and still isn't trusted for an anaphylaxis decision. Everything compounds slowly; one wrong "safe" resets it.

**What it costs:** we can't market ahead of data coverage. Growth is gated on accuracy, not the reverse.

**Where it decided things:** "screening aid, not a medical guarantee" appears in every asset, not just the homepage. Community-sourced allergens are visually distinguished from label-sourced ones — "three shoppers told us" is a materially different claim from "the manufacturer says." Data export and deletion stay easy, because lock-in reads as hostile in a trust-first category.

---

## When principles conflict

They will. The ordering that has held so far:

**Safety** (1, 2) outranks **specificity** (3) outranks **speed of delivery**.
**Reversibility** (4) is a precondition, not a tradeoff — it gets built first or the feature waits.
**Minimum collection** (5) beats convenience, and loses only to a safety requirement.

If a decision needs one of these to lose, that's fine — but write down which one and why. That's what the log below is for.

---

## Decision precedents

| Decision | Principle | What lost |
|---|---|---|
| Accounts restricted to 18+ | 5 | The self-managing teenager |
| Four barriers so a label photo can't reach "safe" | 1, 2 | Faster community data flowing into verdicts |
| Corroboration thresholds 1 to add, 3 to remove | 1 | Symmetry, and easier removal of bad warnings |
| Audit trail and kill switch before the safe list | 4 | Two switching-cost features shipped later |
| Audit table not editable, even by admin | 4 | Admin convenience |
| No merged verdict on multi-profile scan (N11) | 3 | Aisle reading speed |
| Unknown `allergen_source` resolves to "direct" | 1 | Precision |
| Community additions survive removals | 1 | Clean conflict resolution |
| Non-photographic avatars proposed (N23) | 5 | Faster recognition of a child's profile |
| Corrections stored standalone, not as patches (N17) | 6 | Storage efficiency |
| Community additions reach other profiles; removals stay reporter-only until a review queue exists (Sept 10, 2026) | 1, 4 | Symmetric propagation, and fast cleanup of a wrong warning — three throwaway accounts must not be able to clear a peanut warning for everyone |

---

## How this doc gets used

Claude references this when a tradeoff is genuinely ambiguous, instead of asking or guessing. It doesn't override an explicit instruction from JT — if you say do it the other way, that's the answer, and it belongs in the log below as a precedent.

**Add to the precedent table whenever a real tradeoff is resolved.** The table is the part that ages well; the prose is just the reasoning behind it.

---

## Revision log

| Date | Change |
|---|---|
| Aug 15, 2026 | Created. Principles reconstructed from decisions made Aug 5–15, 2026 — not invented. |
| Aug 15, 2026 | **Principle 5 rewritten after JT pushed back** that "collect the minimum" constrains future monetization. He was half right, and the original wording was the problem. It conflated two different things and contradicted the switching-cost argument, which treats accumulated household context as a switching cost — i.e. an asset to grow, not minimise. Now split explicitly: household-owned data grows, our collection about users stays minimal. The legal and COPPA protection is unchanged; the false constraint on the moat is removed. |
