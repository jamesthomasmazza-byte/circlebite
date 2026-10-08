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

**Where it decided things:** corroboration thresholds are deliberately asymmetric — two families to *add* a warning (one report until Oct 7, 2026), three to *remove* one. A community report with unknown provenance resolves to "direct ingredient," not "trace." When an addition and a removal conflict, the warning survives.

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
| Corroboration thresholds 2 to add, 3 to remove, counted in families — the owner of the profile each report was filed from, so an owner, co-manager and follower of one child are one — with allergen spellings folded (Oct 7, 2026). Supersedes "1 to add, 3 to remove", counted in reporters, Aug 2026 – Oct 7 | 1 | Symmetry, and easier removal of bad warnings. Since Oct 7, also the one-report warning: a true report from one family changes only that family's view until a second family reports it. One report was one account, and signup is open to any adult, so it could put a warning in front of every family in the app |
| Audit trail and kill switch before the safe list | 4 | Two switching-cost features shipped later |
| Audit table not editable, even by admin | 4 | Admin convenience |
| No merged verdict on multi-profile scan (N11) | 3 | Aisle reading speed |
| Unknown `allergen_source` resolves to "direct" | 1 | Precision |
| Community additions survive removals | 1 | Clean conflict resolution |
| Non-photographic avatars proposed (N23) | 5 | Faster recognition of a child's profile |
| Corrections stored standalone, not as patches (N17) | 6 | Storage efficiency |
| Community additions reach other profiles; removals stay reporter-only until a review queue exists (Sept 10, 2026) | 1, 4 | Symmetric propagation, and fast cleanup of a wrong warning — three throwaway accounts must not be able to clear a peanut warning for everyone |
| AI accuracy page gated behind `is_admin`, not open to every signed-in user; judge account deliberately not granted it (Sept 11, 2026) | 5 | Signup is open to any adult, and with a small user base the by-allergen breakdown can effectively identify a specific person's allergy — the same fact that already justified not letting community removals propagate |
| Review queue shows reporter pseudonyms, not identity, and flags same-circle reporters; admin rejector identity shown in full (Sept 19, 2026) | 5 | Seeing exactly who reported an allergen — the same identifiability risk already used to withhold the AI accuracy page from the judge account. Rejector identity is kept because it's accountability for an admin action, not a user's health data |
| A photo-sourced scan's "we can't see everything" override applies per allergen, not only at the rollup (Sept 26, 2026) | 1, 2 | A clean card — an allergen the deterministic pass missed now renders as its own honest "unconfirmed" line instead of silently disappearing, even when a different allergen on the same profile already made the overall verdict unsafe for an unrelated reason. An override justified by "we can't see everything" has to apply everywhere that claim is actually made, not just at the top level, or it only catches the case where nothing else escalates |
| A rejected report is judged by direction on the reporter's own view: a rejected removal stops clearing it, a rejected addition keeps warning it (Sept 29, 2026) | 1, 4 | Symmetry, and the admin's rejection being final everywhere — the reporter who attested an allergen from the package in their hand keeps their own warning even after it's pulled from other families, because a third party's decision must not move a family's view toward safe. A rejected removal stopped changing anything anyone saw, which made the undo a no-op for the one view it was meant to fix |
| Report confirmations state what the server says happened, not what the report's direction implies — "shows for other families" only when a corroborated addition actually reaches them (Sept 29, 2026) | 7, 4 | One fixed message per direction. With the community kill switch off, the old copy claimed a warning was protecting other families when it wasn't — a switch that's a precondition for shipping (principle 4) has to be reflected in what the app claims, or turning it off quietly makes the app lie |
| The verdict card's evidence lives on each allergen row — the quoted matched text or cited span — and the explanation sentence renders only when it says what no row can (Sept 30, 2026) | 7, 2 | The one-sentence summary above the rows. It restated the rows ("Contains Peanut and Tree nut") on a card read in three seconds in an aisle. A row quotes only text that exists: a structured tag gets "listed on the product record" and no quote, because a fabricated quote on this card is the worst failure the app has |
| A rejection unlocks re-filing, but a re-file is evidence for review, not a vote: it changes the reporter's own view at once and reaches other families only when an admin accepts it or independent reporters corroborate the claim on their own. The reporter is told their earlier report was reviewed and not accepted, never the admin's reason (Oct 1, 2026) | 4, 1, 7 | Speed for a true warning someone re-files after a reformulation — it waits for an admin. The alternatives were worse: a permanent lockout loses the person most likely to notice a recipe change, and a re-file that counts as a vote lets one person undo an admin's rejection for every family as often as they like (a warning then corroborated on one report; since Oct 7 it takes two families, and a counted re-file could still be the second). The rejection reason stays admin-facing because it was written as an audit step; showing it to reporters would change who admins write it for |
| Downgrades are for the profile's managers: any circle member may report an allergen present, but only the owner or a co-manager may report one isn't there or that the product is wrong. Followers cannot (Prof. Yoest's Oct 1 approval; Oct 1, 2026) | 1, 3 | A follower who is holding the package and is right — they can still escalate, and can tell a manager, but can't clear a warning even on their own view. Co-managers are included on purpose, though the approval says "the parent who owns the profile": a co-manager was invited and can already delete the allergen outright, so refusing them a reviewable report protects nothing and makes the safe action harder than the drastic one. The babysitter in his example is a follower |
| "Safe" is never shown to a user — not as the verdict label, not negated. The clean verdict reads "No listed allergens found"; the lead sentence on a photo-sourced or unchecked card opens "Not confirmed — …" instead of "This hasn't been confirmed safe — …". Every verdict card, and scan history, carries "If anyone has an allergic reaction, call 911." beside the screening-aid disclaimer (Prof. Yoest's Oct 1 approval; Oct 1, 2026) | 7, 1 | A one-word headline read from arm's length — five words now wrap to three lines at 320px. Supersedes the Sept 30 "hasn't been confirmed safe" wording; that precedent's intent holds, since the limit ("Not confirmed") still comes first. A clean label is a finding about the listed ingredients, not a promise about eating it: cross-contact risk survives a clean label, and a word that implies otherwise costs more trust than it saves time |
| Three notions of "the same allergen" live in the code, each with one job — pick per check, deliberately (Oct 8, 2026). **Matcher keywords** (`match.ts` `matchAllergen`, and `allergensOverlap` built on it) decide whether something concerns a profile's allergen: what a card shows, and anything that explains or links to what a card shows. **Family key** (`allergenFamilyKey`: spelling plus synonym cluster) groups agreement that an allergen is present — add_caution corroboration, and grouping warnings. **Spelling key** (`allergenFoldKey`: trim, lowercase, trailing "s"; never a cluster) groups claims that one isn't there — remove_caution corroboration. A new check uses the notion of whatever it answers to: a message about a card uses the card's notion, a count uses its direction's key | 1, 7 | One notion everywhere. The three disagree by design — escalation is safe to over-merge, clearing never is — so no single one is right for every check. The cost of not choosing deliberately is already on record: the held-removal note was written against the card (keywords) and its review-queue link against the corroboration block (family key), so "Walnut" under a confirmed "Tree nuts" warning told the parent a reviewer saw both when none did |

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
