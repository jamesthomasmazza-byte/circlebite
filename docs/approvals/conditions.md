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
  then Condition 2's notices, then the page". Checked on production October 25, 2026, by JT, on
  `421c799`: the header, then the notice, above Scan's form. No screenshot of that check is in the
  repo.
- **Slim on Scan (since October 26, 2026).** On Scan, "Changes to review" and "Allergens to check"
  are now a tinted line per profile instead of a boxed list under a visible heading
  (`client/src/LandingNotices.tsx`, `slim`). Each line keeps the full sentence, e.g. "Priya Nair
  changed Maya's profile — 1 update you haven't reviewed.", and its link to the profile. The
  heading stays for screen readers. Nothing else changed: same data, no dismiss, gone only when
  the entries are acknowledged (or the allergen resolved), still under the header and above Scan's
  form. The Profile tab keeps the full version, and the failed-check alert is the same on both. At
  390px a line still wraps to two or three lines: the sentence was kept whole rather than cut to
  one line. Checked locally at 390×844 on the judge seed, with a co-manager's edit and an allergen
  needing a look: both lines, and both links, on the first screen with no scrolling, above Scan's
  form. Tests: `client/src/LandingNotices.test.ts` ("slim: …") and `client/src/TabShell.test.ts`
  ("Scan gets the slim notices and the Profile tab the full ones"). Not yet checked on production.
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
  which claimed more than the code does. Reworded again October 26, with `CIRCLE_ESCALATIONS`
  switched on (`docs/server-setup.md` §11a): in the corroboration sentence below it, a pending
  report that an allergen is present no longer changes only "the reporter's own view of the scan
  they filed it from". It shows on that child's card for everyone in the child's circle, marked
  "reported in your circle, not yet confirmed", and on no other child's card until a second family
  reports it. The cross-family sentence itself is unchanged: the circle is one profile's, so
  nothing crosses to another family, and a removal still never travels.
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
  - *Circle escalations, on production, October 26, 2026.* At 20:42 ET, co-manager timmy filed a
    test report that Plain Rice Crackers (synthetic, 2990000000014) contains eggs, from James
    Mazza's profile. With the switch still off, the owner's scan of that barcode showed "No listed
    allergens found". JT switched `CIRCLE_ESCALATIONS` on at 20:46 ET, and the owner's scan then
    showed "eggs — contains — reported in your circle, not yet confirmed". It never reached another
    family's card. JT rejected the test report in `/admin/review-queue` at about 21:05 ET, reason
    "Test report on a synthetic product, Oct 26 switch check.", and a rescan as the owner then
    showed "No listed allergens found". (Corrected October 26: this note first said the report
    "stays pending".)
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

- **Mention follow requests in the next email.** Not his ask: JT's own commitment. Item 6 (asking
  to follow a parent by their email address, for the owner to approve) was to be described to him
  before `CIRCLE_REQUESTS` was switched on. JT changed that on October 27: switched on that day, to
  be mentioned in the next email instead (`BACKLOG.md` item 6; `docs/principles.md`, Decision
  precedents, October 27). **Closed: mentioned the evening of October 27**
  (`2026-10-27-jt-judges-reporter-row.md`).
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
  Conditions 1 and 2. **Done October 23** (Conditions 1 and 2, above). Sent October 23; his
  October 24 email confirms receipt.
- **The shared-escalations fix deployed with the setting off** (`e6f96c9`, `CIRCLE_ESCALATIONS`
  off; `docs/server-setup.md` §11a). **Done October 23:** `82d6c76` deployed at 17:20 UTC,
  migration 0045 applied, `CIRCLE_ESCALATIONS` unset (off), and every post-deploy check passed,
  including a real label-photo AI call. Sent October 23; his October 24 email confirms receipt.
- **A short page on the fake-family risk** and the two hardening steps (scan history; same-hand
  photo flags) as the gate before removals may ever cross families. Written October 23:
  `docs/fake-family-risk.md`. The hardening it describes is not built (`BACKLOG.md`, deferred until
  after judging). Sent October 23; his October 24 email confirms receipt.

### Due Friday, October 30 (his October 24 email, `2026-10-24-yoest-green-card-screenshot.md`)

- **Ship `96041b4` with the switch-on.** `96041b4` deployed Oct 24 in `aa349f7`; still in
  `421c799`, deployed Oct 25 and running with `CIRCLE_ESCALATIONS` on since Oct 26, 20:46 ET.
- **One screenshot of the co-manager's card after a pending removal,** the note on the row and no
  green all-clear: `img/circlebite-comanager-pending-removal-2026-10-26.png`. Taken October 26 from
  timmy's scan history on production, his October 23 Oat Biscuits report: "Contains an allergen",
  the sesame row "you reported it isn't in this — pending review", then "Your report hasn't changed
  it". A fresh scan can't show it: a report applies only to its own scan, and a duplicate report
  is refused. Taken the evening of October 26, before scan history used cards: since `801ac67`
  (deployed October 26 in `5b3d4c3`) the same words sit inside a card.
- **Both sent October 26, 9:26 PM ET,** in the same thread
  (`2026-10-26-jt-green-card-screenshot.md`). His October 27 email acknowledges both: "Both items
  are done, and four days early." (`2026-10-27-yoest-follower-reporter-name.md`).

### Due Friday, October 30 (his October 27 email, `2026-10-27-yoest-follower-reporter-name.md`)

- **"Tell me in two or three sentences whether followers should see the reporter's name, and
  why."** His example: "timmy (co-manager) reported eggs present." JT's answer: no, the role
  only. A follower now sees "A co-manager in Maya's circle reported eggs present and photographed
  the label."; the owner and co-managers keep the name; everyone sees "You" for their own report.
  The server withholds the name, so it never reaches a follower's browser
  (`server/src/corrections/circleEscalations.ts`, `circleReporter`).
- **Built October 27, 2026,** in `79f299c` (the wording) and `3d285fb` (the server); on main, not
  yet deployed. Decision: `docs/principles.md`, Decision precedents, October 27. Tests:
  `server/src/corrections/circleReporterVisibility.test.ts` (each role: owner, co-manager, full and
  severe-only follower, someone who has left, a deleted account; and no other member's name in a
  follower's live card or history) and `client/src/lib/correctionCopy.test.ts`
  ("circleReportLine, for a follower: …").
- **Where else a follower could see who is in the circle:** nowhere. The circle summary and change
  history 404 them (`server/src/routes/circle.ts`, `server/src/routes/profileChanges.ts`), the
  profile page and the Circle tab show them no people, and scan history names no scanner. A
  report line was the only place.
- **Sent October 27, 11:51 AM ET,** in the same thread
  (`2026-10-27-jt-follower-reporter-name.md`): followers see the role, not the name, with the
  reasons above. The reply also says the change is "tested and live on production as of this
  morning". Accurate: production has run `29854ef`, which includes `3d285fb`, since about 11:44
  AM ET, confirmed by JT at 11:45 (`docs/journal.md`, October 27). Verified by tests and a local
  check, not yet by a follower account on production.
- **Closed:** October 27, 2026, sent and deployed.

### Due Thursday, November 13 — the code freeze (his October 27, 2:51 PM email, `2026-10-27-yoest-judges-reporter-row.md`)

- **"By your November 13 code freeze, add one row: a barcode where a co-manager has a pending
  escalation, and what the owner sees next to what the follower sees."** Planned October 27: one
  barcode per judge, a pending Sesame report by Priya (co-manager) on Maya, where the judge is the
  owner and sees her name, and a pending Wheat report by Sam (co-manager, new to Noor) on Noor,
  where the judge follows and sees the role only. Seeded by the judge seed, so it holds after every
  reseed. **Built October 27** (`255f867`, the seed and its tests; `f91691a`, the row in
  `JUDGES.md`) and checked locally as judge1 at 390px, both cards worded as the row quotes. Pushed
  October 27 (`cd97de2`).
- **Reply sent the evening of October 27** (`2026-10-27-jt-judges-reporter-row.md`). It also
  described circle requests and guided sign-up.
- **Deployed October 29**, about 12:10 PM ET, in `154a6ba` (release `20261029160944`), as the
  shared-barcode version below.
- **Still owed:** the reseed that makes it true on production. Deploying doesn't, because the seed
  only writes these rows when it runs. The production reseed that does is the judging-week
  `--rotate-passwords` reseed (week of November 16), run by JT in his own terminal (`BACKLOG.md`,
  "Week of Nov 16 — judges"). Until then, production has no such barcode.

### Due Thursday, November 13 — the code freeze (his October 27, 7:55 PM email, `2026-10-27-yoest-one-shared-barcode.md`)

- **"Please let every judge scan the same barcode, and handle the separation in the data so reports
  from judge accounts never count toward another judge's confirmation."** It changes the row above:
  one barcode for every judge in place of one each (`255f867`, `f91691a`), with judges' reports kept
  apart by the data rather than by the barcode. His reason: "a barcode per judge is one more thing
  for them to keep track of, close to handing out passwords."
- **Planned and approved October 29** (JT): judge worlds. Each judge's account and invented circle
  carry a world (`users.judge_world`, migration 0049, set only by the judge seed and allowed only
  on the seed's reserved domain), and each report is stamped with its world at insert. Corroboration
  counts and confirms only within a world. A judge's report never counts toward another judge's
  confirmation, which is his ask, or toward or against a real user's claim. A report a judge files
  while testing is counted the same way. Decision: `docs/principles.md`, Decision precedents.
- **Built October 29:** `c32c3c0` (migration 0049), `fa98427` (counting), `0922861` (what a card
  shows), `f52733c` (the review queue), `e9dec87` (the seed, every judge on `2990000000083`),
  `f256065` (the `JUDGES.md` row). Real users' thresholds are pinned by
  `server/src/corrections/recordCorrection.test.ts`, unchanged. The worlds are tested in
  `judgeWorldCorroboration.test.ts`, `judgeWorldVisibility.test.ts`, `db/judgeWorld.test.ts` and
  `judgeSeed.test.ts`. Pushed October 29 (`154a6ba`).
- **Built and deployed to production October 29, about 12:10 PM ET, in `154a6ba` (release `20261029160944`), migration 0049 applied, backup taken first. The production false-safety check passed after the deploy
  (`docs/server-setup.md` §8): James's peanut profile on `2990000000076` still read "Contains an
  allergen", reported by 2 shoppers.
- **Reply sent October 29** (`2026-10-29-jt-one-shared-barcode.md`), after the deploy: built,
  deployed, and in effect from the judging-week reseed.
- **Takes effect on production at the judging-week reseed.** Until then, production's seeded
  accounts have no world, and it has no seeded circle reports: the reporter row's seed has never run
  there.

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

The October 27 evening reply (`2026-10-27-jt-judges-reporter-row.md`) said one thing the code
doesn't do. **Owed and sent the same evening** (`2026-10-27-jt-follow-request-correction.md`).

5. "The owner is emailed about each new request." CircleBite sends no email. Owners learn of circle
   requests in the app, from a line on Scan and a badge on the Circle tab. Corrected the evening of
   October 27. Acknowledged in his 7:55 PM reply the same evening
   (`2026-10-27-yoest-one-shared-barcode.md`).
