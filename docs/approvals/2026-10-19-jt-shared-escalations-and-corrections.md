# Shared escalations, the second-family answer, restore evidence, and three corrections

**From:** James Mazza (mazzajt@cua.edu)
**To:** Prof. Jack Yoest (yoest@cua.edu), cc moskowski
**Date:** October 19, 2026, 11:16 AM, as shown in the quote header of Prof. Yoest's reply
(`2026-10-19-yoest-fake-family-page.md`), which gives no timezone
**Answers:** his October 14 ask (`2026-10-14-yoest-shared-escalations-ask.md`) and the evidence he
asked for on October 6 (`2026-10-06-yoest-corroboration-challenge.md`)

JT's sent message, not a reply from Prof. Yoest. Reproduced verbatim from the copy quoted in his
reply, with one exception: the S3 bucket name in the backup status line is withheld, because this
repo keeps bucket names out of it (`docs/server-setup.md`). The cc is as JT gave it; the quoted copy
doesn't show recipients. Indexed in `docs/approvals/conditions.md`.

---

> Subject: Re: CircleBite — shared escalations, and three corrections
>
> Prof. Yoest,
>
> The shared-escalations fix is in:
> https://github.com/jamesthomasmazza-byte/circlebite/commit/e6f96c9c240a66b93f41a8997e70184e8e83e337
>
> It's merged but not yet deployed. When it goes out it will be behind a setting that starts off, so the live site won't change until I switch it on, and I'll do that after a production check rather than over a weekend on the path every scan reads.
>
> Your three test cases:
>
> - recordCorrection.test.ts:527 — two families spelling it "Peanut" and "peanut" corroborate one claim
> - recordCorrection.test.ts:572 — "Milk", "Lactose" and "Whey" reported absent don't add up to clearing a milk caution
> - userScanView.test.ts:247 — a co-manager's pending escalation is visible to the child's parent
>
> I broke the loader twice on purpose to confirm the new tests actually fail when the behaviour is wrong.
>
> On your question about the label. The first version I wrote said the report was "one family's say-so." I only noticed what was wrong with that when I looked at the card on a phone-sized screen: the sentence before it says the reporter photographed the label. The photo requirement is what makes a report evidence rather than hearsay; it shouldn't be undercut in the next breath. The card now reads:
>
>   Peanut (severe) — contains — reported in your circle, not yet confirmed
>
>   Priya Nair (co-manager) reported Peanut present and photographed the label. No other family has confirmed it yet.
>
> The qualifier sits on the allergen row itself, where the verdict is, and the explanation is in muted text below both allergen cards. The first version had a bold heading and four sentences, louder on the page than a warning two families had already corroborated. The weaker claim shouldn't be the louder one.
>
> On the second family. Nothing structural stops it: sign-up is open to any adult, so a second account with its own child profile counts as a second family, and the required label photo only raises the cost. What limits the damage is the asymmetry, two fabricated families can put a false warning in front of other families, which costs a parent a second look at a label, while no number of them can clear a real warning, because a removal never crosses a family line at all. Before removals are ever allowed to travel, corroboration has to get more expensive to fake: counting only accounts with their own scan history, and flagging reports whose photos or origin look like the same hand.
>
> Restore evidence, which you asked for on October 6 and I did not send. This is the October 11 run, unattended, on the weekly timer:
>
>   restore-test: newest set circlebite-20261011T073020Z
>   restore-test: checksums match
>   restore-test: restored into circlebite_restoretest_20261011080020
>     users 24 · allergen_profiles 18 · allergens 37 · scans 78
>     migrations: schema current (44 migrations)
>     photos: 4 referenced, 4 in the tarball, 0 already missing
>   restore-test: PASSED — circlebite-20261011T073020Z restores and checks out
>
>   backups: local    OK  2026-10-13T07:30:22Z  dump=95KiB photos=28MiB
>   backups: offsite  OK  2026-10-13T07:30:27Z  s3://[bucket name withheld]/...
>   backups: restore  OK  2026-10-11T08:00:22Z  passed; schema current
>
> The full output, with the command that pulled it, is in the repo:
> https://github.com/jamesthomasmazza-byte/circlebite/blob/main/docs/evidence/2026-10-11-restore-test.txt
>
> I sent that run rather than the first one deliberately. A single manual restore shows it worked once; this shows it still works with nobody watching.
>
> Three corrections to my October 8 note.
>
> First, and this one matters: I described the attached screenshot as showing a co-manager lowering an allergen's severity and then removing it. It does not. It shows my own two edits to a profile I own. The co-manager sequence did happen on production that day, but I didn't screenshot it then. The attached screenshots, taken October 16, show the owner's dashboard and change history with timmy's two October 8 entries, still unacknowledged. I should have checked the file against the sentence before sending it.
>
> Second, I wrote that I verified both conditions on production. That holds for profile edits, a co-manager changing or removing an allergen, logged and attributed, owner notified. It does not hold for downgrade reports, which is the path carrying the evidence photo, and which Condition 1 names. Those are covered by tests, not a production check. I'll file one on production once my midterms are done and send you what the owner sees.
>
> Third, the restore date. The first test ran at 21:48 Eastern on October 5, which is 01:48 UTC on the 6th. I gave you the UTC date without saying so.
>
> One heads up on timing: I have midterms this week, so the rest of this comes after them. By the end of this coming weekend, October 25, I should have filed the production downgrade report and deployed the fix with the setting still off; I'll send you both then. I'll switch it on early the following week, after the production check.
>
> Best,
> James Mazza

---

## What this commits to

1. **By Sunday 2026-10-25:** file one downgrade report on production and send Prof. Yoest what the
   owner sees.
2. **By Sunday 2026-10-25:** deploy the shared-escalations fix (`e6f96c9`) with `CIRCLE_ESCALATIONS`
   off, and send him that it's deployed.
3. **Early the week of October 26:** switch the setting on, after the production check.
4. **Not in this email:** the answer to "define corroborated" (two families). Still owed by email
   (`conditions.md`, "Other open asks").
