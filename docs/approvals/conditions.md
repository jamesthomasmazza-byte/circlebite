# Conditions register

Prof. Yoest's conditions on this entry, numbered, with his exact wording, where each came from,
and what closed it. If an email says "Condition N", this file says which one it means. Every entry
cites evidence in this repository, not in an inbox.

## Where the numbers come from

Prof. Yoest never numbered anything himself. His October 2, 12:13 PM email
(`2026-10-02-yoest-overrule-conditions.md`) makes four requests in this order: two he calls
"conditions", one "question", and one "operational note". The approval file's "What this binds"
list, written October 5 (`f20428c`), numbered them 1–4 in that order. JT's October 8 email used
those numbers ("Condition 4", "Conditions 1 and 2") without naming 3. His October 9 reply
(`2026-10-09-yoest-condition-3-status.md`) adopted the numbering and asked for Condition 3's
status.

So **Condition 3 is the cross-family README sentence.** It is also the only one of the four that
JT's October 8 email left out, and the gap is why he asked.

---

## Condition 1 — Log every downgrade

> First, log every downgrade: who made it, when, and what evidence they gave.

- **Source:** October 2, 2026, 12:13 PM. He calls it a condition on widening downgrades from
  owner-only to owner-or-co-manager.
- **Status: closed.** Profile edits were verified on production October 8; downgrade reports on
  October 23 (below). Prof. Yoest accepted it as closed on October 9. That acceptance rests on the
  October 8 email, which claimed more than had been checked (see "Corrections owed" below),
  corrected to him on October 19.
- **Built:** October 6, 2026. Profile change history, migrations 0036–0039. A downgrade report
  (`downgrade_reported`, migration 0037) is the only kind of entry that records **evidence**: the
  label photo, the note and the verdict at the time of the report.
- **How it was verified:**
  - *Profile edits, on production, October 8, 2026,* on JT's test accounts. An owner added Sesame
    to "Timmy" and lowered it from severe to mild. On a second profile, co-manager `timmy` lowered
    "Ownertest" from moderate to mild and then removed it. Each entry is logged with who and when.
    Attribution is correct from both sides: the owner saw "timmy (co-manager) removed Ownertest",
    and the co-manager saw "James Mazza (owner) added Ownertest". Evidence:
    `circlebite-downgrade-history-2026-10-08.jpg` (the owner's own two edits, sent to Prof. Yoest
    on October 8) and `img/circlebite-comanager-history-2026-10-16.png` (the co-manager's two
    entries — taken October 16, 7:18 PM ET; the two October 8 entries, still flagged New).
  - *Downgrade reports, by tests only:* `server/src/profileChanges/profileChanges.test.ts`, "a
    co-manager's downgrade is recorded with who, when and the evidence, snapshotted from the report
    and scan", and the downgrade tests after it; `server/src/routes/profileChanges.test.ts`, "the
    downgrade's photo is served from the entry after its scan is gone"; and
    `client/src/lib/profileChangeCopy.test.ts`. On production, an escalation (`add_caution`) was
    filed October 16, 7:15 PM ET; no downgrade (`remove_caution`), because none of the products
    checked had a card flagging an allergen its label doesn't list.
  - *Downgrade reports, on production, October 23, 2026,* after the deploy of `82d6c76` (17:20 UTC;
    migration 0045 applied, `CIRCLE_ESCALATIONS` off). Co-manager `timmy` filed `flag_wrong` →
    `remove_caution` on Sesame, scanning James Mazza's profile, at 2:22:08 PM ET. The product is
    the judge seed's synthetic Oat Biscuits (2990000000038), whose record lists a sesame trace;
    the photo is a printed label marked "TEST LABEL — synthetic product", not a real package, and
    the note says the same. The owner's history shows the entry with who ("timmy (co-manager)"),
    when, the verdict at the time ("The card had said: Contains an allergen"), the note and a link
    to the label photo. Evidence: `img/circlebite-downgrade-history-2026-10-23.png`. Taken before
    the Oct 23 wording change: its line "Timmy's card no longer warns about sesame" is generated
    when the page loads, and now reads "Timmy's card still warns about sesame, marked as disputed
    until it's reviewed" — what the card does since a removal stopped lowering the reporter's own
    view (`docs/principles.md`, Oct 23). The recorded entry itself is unchanged.
- **Closed:** October 8, 2026, for profile edits; October 23, 2026, for downgrade reports.

## Condition 2 — Notify the owner when a co-manager downgrades

> Then, notify the owner whenever a co-manager downgrades a verdict. The owner should never learn
> about a change to their child's profile by accident.

- **Source:** October 2, 2026, 12:13 PM, the same email and paragraph as Condition 1.
- **Status: closed.** Profile edits were verified on production October 8; downgrade reports,
  the case his wording names ("downgrades a verdict"), on October 23 (below). Prof. Yoest accepted
  it as closed on October 9, on the strength of the October 8 email.
- **Built:** October 6, 2026. An in-app notice with acknowledgements (migration 0040), not email:
  a hosted sender would breach R6, and EC2 blocks outbound port 25. Prof. Yoest approved the
  in-app route on October 6.
- **Where the notice lives (since October 23, 2026).** The app now opens on Scan, not the
  dashboard, which is gone (`/dashboard` redirects). The same "Changes to review" notice shows at the
  top of Scan and of the Profile tab, until the entries are acknowledged on the profile page, and a
  count badge on the Profile tab carries it on every other screen (`client/src/TabShell.tsx`).
  Verified locally: with a co-manager's edit unacknowledged, the first screen after sign-in named
  the co-manager and the profile, with no navigation; acknowledging cleared the banner and the
  badge. Tests: `client/src/LandingNotices.test.ts` (the notice renders on the landing screen from
  the unseen-changes data) and `client/src/lib/tabs.test.ts` (Scan is the landing page and sits
  inside the layout that shows it). The mentions of "the owner's dashboard" below are what it
  showed at the time.
- **A header above it (since October 25, 2026).** Every signed-in screen now opens with a one-line
  header, the wordmark and "Scanning for: <name>" (`client/src/TabShell.tsx`). It is the only thing
  above the notice; the notice still comes before the page itself. Checked locally at 390×844 on the
  judge seed, with a co-manager's edit and downgrade report unacknowledged: on Scan and on the
  Profile tab the whole notice, its "Review changes" link included, showed on the first screen with
  no scrolling, above Scan's form. Test: `client/src/TabShell.test.ts`, "the header renders first,
  then Condition 2's notices, then the page". Not yet checked on production.
- **How it was verified:**
  - *Profile edits, on production, October 8, 2026.* After the co-manager changes in Condition 1,
    the owner's dashboard showed "Changes to review — Timmy changed James Mazza's profile — 2
    updates you haven't reviewed". The profile's history showed both entries flagged New, with
    an "I've seen these" control. Evidence: `img/circlebite-owner-notice-2026-10-16.png` (the
    dashboard, with the signed-in address redacted — taken October 16, 7:18 PM ET; the two
    October 8 entries, still unreviewed) and `img/circlebite-comanager-history-2026-10-16.png`
    (taken October 16, 7:18 PM ET; the two October 8 entries, still flagged New).
  - *Downgrade reports, by tests only:* `server/src/routes/profileChanges.test.ts`, "only the
    owner can acknowledge; the banner count follows the acks". The owner's unseen-changes notice
    counts a co-manager's downgrade report (`hasDowngrade: true`), the co-manager gets no notice,
    and only the owner can acknowledge.
  - *Downgrade reports, on production, October 23, 2026,* the report in Condition 1. The owner's
    dashboard showed "Changes to review — Timmy changed James Mazza's profile and disputed a scan
    warning — 3 updates you haven't reviewed": the downgrade report plus the two October 8 entries,
    still unacknowledged. Evidence: `img/circlebite-downgrade-owner-notice-2026-10-23.png` (signed-in
    address redacted) and `img/circlebite-downgrade-history-2026-10-23.png` (all three entries
    flagged New, with "I've seen these"). That the co-manager gets no notice and only the owner can
    acknowledge is still verified by the test above, not on production.
- **Scope — escalations are not downgrades.** A report that adds a warning (`add_caution`) never
  creates a change-history entry and never appears in the owner's banner, including with
  `CIRCLE_ESCALATIONS` on. The only trigger that writes a report into `profile_changes` fires on
  `remove_caution` alone (migration 0037, `profile_changes_downgrades`), and the banner counts
  `profile_changes` rows only (`server/src/profileChanges/acks.ts`, `loadUnseenChanges`).
  `CIRCLE_ESCALATIONS` changes only what the circle sees on a scan
  (`server/src/corrections/circleEscalations.ts`) and writes nothing to the history. Test:
  `profileChanges.test.ts`, "a wrong_product downgrade is recorded with no allergen; an escalation
  is not recorded at all".
- **Closed:** October 8, 2026, for profile edits; October 23, 2026, for downgrade reports.

## Condition 3 — Only escalations cross family lines

> One question on the overrule loop. You showed a warning traveling to a second family's profile.
> Confirm that only escalations cross family lines, and that a downgrade in one family never
> clears a warning in another. Put the answer in one sentence in your README.

- **Source:** October 2, 2026, 12:13 PM. He calls it "one question", not a condition.
- **Status: closed.** It was answered to Prof. Yoest on October 5, 8:25 PM, and he acknowledged it
  on October 6, 9:32 PM: "only escalations cross family lines, and a downgrade has no code path to
  travel." He asked for its status again on October 9, because the October 8 email didn't mention
  it, and confirmed it closed on October 14, 07:20 UTC: "Condition 3 is closed."
  (`2026-10-14-yoest-shared-escalations-ask.md`).
- **Where:** `README.md`, under the MVP statement: "**Only escalations cross family lines.**"
  Added October 5 (`f20428c`). Reworded October 13 (`b26f3b9`): a pending report changes "the
  reporter's own view of the scan they filed it from", not "the reporting family's own view",
  which claimed more than the code does.
- **How it was verified:** by construction, and by tests.
  - The only code path by which a report reaches another family's profile reads corroborated
    `add_caution` rows only (`server/src/corrections/communityAdditions.ts`), and the function
    that applies them can only raise a verdict to `contains`
    (`server/src/corrections/applyCommunityCorrections.ts`). No path exists for a removal to
    travel.
  - Tests: `communityAdditions.test.ts` "excludes rejected, pending, and remove_caution
    corrections"; `applyCommunityCorrections.test.ts` "never clears or downgrades anything";
    `userScanView.test.ts` "the reporter's own remove_caution changes only their view".
  - On production, the escalation half is demonstrated by the judge seed: barcode 2990000000076
    escalates Maya (peanut) and not Leo (`JUDGES.md`). The downgrade half has nothing to
    demonstrate on production, because there is no path for it to take.
- **Closed:** October 5, 2026.

## Condition 4 — Automated backups with a tested restore

> A small operational note: with Postgres on the same box as the app, set up automated backups
> now, before real circles depend on the data.

Extended on October 6, 9:32 PM (`2026-10-06-yoest-corroboration-challenge.md`):

> And when your nightly backup is in place, send me evidence of one successful test restore. ( A
> backup you have never restored is only a hope.)

- **Source:** October 2, 2026, 12:13 PM. He calls it "a small operational note". JT's October 8
  email first called it "Condition 4".
- **Status: closed.** Prof. Yoest accepted it on October 9.
- **How it was verified:**
  - *First restore test, October 5 (Eastern).* It passed on the box that evening. It restored into
    a scratch database with no privileges on production, then queried it: 35 migrations, and all
    3 referenced correction photos present. The S3 copy was checked byte-identical from the Mac,
    and `backup-status.sh` reported OK on all three lines. Records: `docs/journal.md`, 2026-10-05,
    "Backups that can tell you they've stopped"; `BACKLOG.md`'s backups item; runbook
    `docs/server-setup.md` §17. A weekly timer repeats the restore test.
  - *First unattended run, October 11, 2026, 08:00 UTC.* The weekly timer restored the newest
    backup set, `circlebite-20261011T073020Z` (taken 07:30 UTC), with no one at the keyboard:
    checksums matched, the schema was current at 44 migrations, all 4 referenced correction photos
    were in the tarball, and it reported `restore-test: PASSED`, then dropped the scratch database.
    Full output, with the command that pulled it: `docs/evidence/2026-10-11-restore-test.txt`.
- **Closed:** October 5, 2026, Eastern. That was already October 6 in UTC, which is the date the
  October 8 email gave. The journal entry that records the pass was committed at 22:08 ET on
  October 5.
- **Evidence sent October 19:** the evidence he asked for on October 6. The October 8 email
  described the restore but attached none. The October 19 email
  (`2026-10-19-jt-shared-escalations-and-corrections.md`) carried the October 11 unattended run,
  with a link to its full output (`docs/evidence/2026-10-11-restore-test.txt`). His reply the same
  day (`2026-10-19-yoest-fake-family-page.md`) comments on it without formally closing anything.
  See "Corrections owed", item 4.

---

## Other open asks from Prof. Yoest

- **Define "corroborated" (October 6, 9:32 PM):** "How many reports, from how many distinct
  families, before an escalation fires? … Put your answer in one sentence in the README." He calls
  it a challenge, not a condition, and it has no number. Answered in the README on October 7
  (`4e622f2`): "**A warning reaches other families only once two families have reported it.**"
  The code changed the same day, from one report to two distinct families (`CORROBORATION_THRESHOLD`
  in `server/src/corrections/recordCorrection.ts`). **Never answered to him by email.**
  Not in the October 19 email either. Still open.
- **Evidence of a test restore** (October 6). Sent October 19. See Condition 4.
- **The shared-escalations commit link** (October 14, `2026-10-14-yoest-shared-escalations-ask.md`),
  with tests for his three cases. **Sent October 19** (`e6f96c9`, with the three tests by file and
  line), in `2026-10-19-jt-shared-escalations-and-corrections.md`.
- **The second-family question** (October 14): "What stops one determined person from creating a
  second family to corroborate themselves?" **Answered October 19**, same email. His reply the
  same day called the answer "honest and correct" and asked for it to be written down (below).

### Due Sunday, October 25 (his October 19 reply, `2026-10-19-yoest-fake-family-page.md`)

- **The production downgrade report, showing what the owner sees.** Closes the open half of
  Conditions 1 and 2. **Done October 23** (Conditions 1 and 2, above). Open until sent.
- **The shared-escalations fix deployed with the setting off** (`e6f96c9`, `CIRCLE_ESCALATIONS`
  off; `docs/server-setup.md` §11a). **Done October 23:** `82d6c76` deployed at 17:20 UTC,
  migration 0045 applied, `CIRCLE_ESCALATIONS` unset (off), and every post-deploy check passed,
  including a real label-photo AI call. Open until sent.
- **A short page on the fake-family risk** and the two hardening steps (scan history; same-hand
  photo flags) as the gate before removals may ever cross families. Written October 23:
  `docs/fake-family-risk.md`. The hardening it describes is not built (`BACKLOG.md`, deferred until
  after judging). Open until sent.

## Corrections owed to Prof. Yoest

The October 8 email, which his October 9 acceptance rests on, claimed more than was checked.
**All four were sent on October 19** (`2026-10-19-jt-shared-escalations-and-corrections.md`), and
his same-day reply acknowledged the three corrections (`2026-10-19-yoest-fake-family-page.md`).

1. "I verified both on production today rather than in tests." That holds for profile edits only.
   The verdict-downgrade report was verified by tests only, and it is Condition 2's literal case
   and the only path that records evidence for Condition 1. Corrected October 19 (the email's
   second correction).
2. "Screenshot attached: a co-manager lowered an allergen's severity and then removed it." The
   attached screenshot shows the owner's own two edits to Timmy ("You changed Sesame"). The
   co-manager's changes were on a different profile, and their screenshots were not sent on October 8.
   Corrected October 19 (the email's first correction), with the October 16 screenshots attached.
3. "The restore was verified end to end on October 6." That was October 5, Eastern. Corrected
   October 19 (the email's third correction): 21:48 Eastern on October 5, 01:48 UTC on the 6th.
4. **Evidence of one successful test restore, asked for on October 6: none was sent on October 8.**
   Sent October 19: the October 11 unattended run, with its full output in
   `docs/evidence/2026-10-11-restore-test.txt`. For the October 5 run, the repo holds only the
   journal's summary.
