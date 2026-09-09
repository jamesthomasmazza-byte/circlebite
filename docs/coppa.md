<!-- Brought into the contest repo 2026-09-09. Written by JT in August 2026 during the prototype
     build. Three lines were adapted where the original assumed the hosted platform's row-level
     security, which this build does not have; those authorization checks now live in server code.
     Sections 3 (App Store Connect) and parts of 5 apply after judging, not during the contest. -->

# CircleBite — COPPA "Easy Route" Implementation Spec

**Date:** August 7, 2026
**Decision:** CircleBite accounts are restricted to **adults 18 or older**. Children and teens never hold accounts. Their allergy information exists only as a *profile* created and owned by an adult account holder.

> Not legal advice. This spec is designed so a privacy attorney's review becomes a short, cheap conversation rather than a long, expensive one.

---

## 1. Why 18+ (the OODA call)

**Observe.** CircleBite stores allergy data for named children, has a social graph (invite links + follow relationships + severity-gated sharing), and has an admin analytics dashboard with CSV export over that data. Solo founder, pre-revenue, no legal team, iOS submission imminent.

**Orient.** The social graph is the risk multiplier, not the allergy data by itself. If a 12-year-old can hold an account, CircleBite becomes a children's social product — invite links, follower lists, shared health data. That is precisely the fact pattern FTC enforcement targets. The COPPA amendments' full compliance deadline (April 22, 2026) has already passed, so there is no grace period.

The tempting middle option — 13+ — is a trap. It clears COPPA (which covers under-13) but leaves you holding teen accounts, which still trigger minors' provisions in several state privacy laws. You'd do most of the work and get most of the risk.

**Decide.** 18+ account holders only.

**Act.** Changes below.

### What this buys you
- COPPA's core hook — "personal information collected *from* a child online" — is substantially weakened. Information *about* a child, provided by their parent, is a materially different and better posture.
- No verifiable parental consent infrastructure. No separate third-party disclosure consent. No age-band-dependent flows.
- Cleaner App Store position, and no Kids Category obligations.
- Better B2B story for schools/daycares: the staff member is the account holder, students are profiles. Exactly the model districts already expect.

### What it costs you
The self-managing teenager. A 15-year-old with a severe allergy can't hold their own account. Mitigation: the parent creates the profile and, if they want, shares the login or adds the teen's own device to the household. Revisit as a v2 feature with a proper minor flow once there's revenue to fund the legal work.

### What it does NOT solve
An 18+ gate does not exempt you from the Washington My Health My Data Act, state sensitive-data rules, GDPR (if you serve the EU), or product liability. Those are tracked separately.

---

## 2. App changes

### 2.1 Neutral age gate at signup

Add a date-of-birth step to the signup flow, before account creation.

**Design it neutrally.** Do **not** ask "Are you 18 or older? [Yes] [No]" — a self-defeating gate that invites the answer you want. Use a plain date-of-birth entry with no hint about which answers pass. Neutral gates are the standard the FTC looks for.

**Data minimization — important.** Do not store the raw date of birth. Compute adulthood on the server, then persist only:

| Column | Type | Notes |
|---|---|---|
| `age_attested_adult` | boolean | Always `true` for existing accounts (nobody under 18 can exist) |
| `age_attested_at` | timestamptz | When the gate was passed |

Storing full DOB adds a new piece of identifying personal information to your database for no product benefit. Don't.

**Retry prevention.** If the entered DOB is under 18, block account creation and set a local flag (localStorage + a short-lived server-side marker keyed to the email, if one was entered) so an immediate second attempt with a different date is refused. Reasonable effort is the standard here — a determined liar defeats any gate, and that's accepted; a gate that makes lying frictionless is not.

**Failure screen copy:**

> **CircleBite is for grown-ups**
>
> CircleBite accounts are for adults 18 and over. If you have food allergies, ask a parent or guardian to set up an account — they can create a profile for you and you'll both be able to use it.

No "try again" button on this screen.

### 2.2 Backfill and enforcement

- Add the columns with a migration; set existing rows to `age_attested_adult = true`, `age_attested_at = now()`.
- Enforce the attestation in application code on the account-creation path, plus a `NOT NULL` constraint on `age_attested_adult`. **This build has no row-level security layer** (see `legacy-spec.md` §2) — the check lives in the server handler and nowhere else, so it must not be skippable by any other code path.

### 2.3 Terminology — the account holder is an adult

The app currently uses "Profile Owner," "guardian," and "Circle Member" loosely, and in places implies the person with the allergy is the account holder. Make the adult-manager framing consistent everywhere it's user-visible:

| Concept | Use this |
|---|---|
| The account | "Your account" — held by an adult |
| A person's allergy data | "Profile" / "a profile you manage" |
| Adding a child | "Add a profile for someone in your care" |
| The follow graph | "People you share with" / "People who share with you" — all adults |

Avoid copy that addresses a child directly ("your allergies," "scan your snacks") anywhere a child might plausibly be the reader.

### 2.4 Invite and follow flow

Invite links already require the recipient to sign in, which now means passing the 18+ gate — so this is largely handled by 2.1. Two additions:

- Invite screen copy: "Invite another adult to your circle." Makes the intent explicit and evidences your policy.
- Invite acceptance should confirm the accepting account has `age_attested_adult = true` before creating the relationship.

### 2.5 Admin analytics dashboard

The `/admin` dashboard and its CSV export currently reach scan, correction, and confirmation data that is associated with named minor profiles.

- Strip profile names and any free-text allergen notes from CSV exports. Export a `profile_id` only.
- Aggregate the trust-signal and disputed-product views at the product level, not the profile level.
- Restrict admin views to the owner account in application code. The prototype used row-level security for this; here it is an explicit authorization check on every admin query.

Rationale: if the dataset is ever breached, subpoenaed, or used in a B2B pitch, you want it to have never contained identifiable children's health data in exportable form.

### 2.6 Account and profile deletion

Two reasons to do this now: Apple requires in-app account deletion (App Review Guideline 5.1.1(v)) and you will need a deletion mechanism for MHMD anyway.

- Settings → "Delete my account" — deletes the account, all profiles it manages, scan history, and follow relationships. Confirmed with a typed confirmation, not just a button.
- Per-profile delete, already likely present — verify it cascades to scan history tied to that profile.
- Deletion should be real deletion, not a soft-delete flag, for the health data. If you need scan volume for analytics, retain an anonymized counter row with no profile linkage.

### 2.7 Retention

Add a stated retention policy and enforce it: scan history older than **24 months** is purged automatically. Pick a number, state it in the privacy policy, and actually run the job — an unenforced stated policy is worse than no stated policy.

---

## 3. App Store Connect settings (you must do these manually)

| Setting | Value |
|---|---|
| Made for Kids / Kids Category | **No.** Do not opt in. |
| Age Rating | Answer the content questionnaire honestly — likely 4+ on content. The 18+ requirement is a Terms matter, not a content rating. |
| Privacy Nutrition Label — Health & Fitness | Declare **Health** data collected, linked to identity, used for App Functionality only. Not for tracking, not for advertising. |
| Privacy Nutrition Label — Contact Info | Email, linked to identity, App Functionality + Account Management. |
| Tracking | Declare **no** tracking. Do not add an ad SDK. |
| Account Deletion | Confirm the in-app deletion path exists before submitting (5.1.1(v) is a common rejection). |
| App Review Notes | State plainly: "CircleBite accounts are restricted to users 18+. Allergy profiles for children are created and managed by the adult account holder. A neutral date-of-birth gate is enforced at signup." Reviewers look for this on health-adjacent apps. |

Also: your marketing site and App Store description must not read as directed to children. Bright cartoon styling, kid-directed language, or "for kids!" copy can independently make a service "child-directed" regardless of your age gate. The current warm/calm design direction is fine — keep it parent-facing.

---

## 4. Verification checklist

- [ ] Signup with a DOB under 18 → blocked, no account row created, no auth user created
- [ ] Immediate retry with an over-18 DOB → still blocked
- [ ] Signup with a DOB over 18 → account created, `age_attested_adult = true`, `age_attested_at` set
- [ ] Raw DOB is **not** present anywhere in the database or logs
- [ ] Direct API account creation bypassing the UI → rejected server-side
- [ ] Existing accounts backfilled, still able to log in
- [ ] Admin CSV export contains no profile names or allergen notes
- [ ] Account deletion removes profiles, scans, corrections, and follow relationships
- [ ] Terms and Privacy Policy updated and linked from signup, settings, and the App Store listing
- [ ] App Store Connect: Kids Category = No, privacy labels set, review notes written

---

## 5. Still open (not solved by this spec)

1. **Washington My Health My Data Act** — private right of action, in force. Needs its own notice, opt-in consent for collection, separate consent for sharing, working deletion. Partially addressed by §2.6 and the policy language in the companion document.
2. **GDPR** — allergy data is Article 9 special category. Either geofence the EU at launch or do the work. Geofencing is the efficient answer for v1.
3. **Product liability** — the largest risk and unaddressed here. Community corrections now change live verdicts for all users (shipped Aug 5), so a bad-faith or mistaken correction propagates. Recommend: rate-limiting and an abuse check on the correction pipeline, an immutable audit trail of verdict changes, and a quote for tech E&O / product liability coverage before launch.
4. **Attorney review** — the liability limitation language in your draft Terms is the single clause most worth an attorney's time, given a false-negative scan can precede anaphylaxis.
