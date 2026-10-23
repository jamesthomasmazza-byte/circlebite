# Fake families: the risk, and the gate before removals travel

Written October 23, 2026, at Prof. Yoest's request of October 19. **The risk is contained by the
asymmetry below. The hardening that would let removals travel is not built.**

## The risk

Sign-up is open to any adult, and nothing confirms the email address. For corroboration, a family
is the owner of the profile a report was filed from (`countCorroboratingFamilies`,
`server/src/corrections/recordCorrection.ts`). So a second account with its own child profile is a
second family. Every report needs a label photo (`photo_required`,
`server/src/routes/corrections.ts`), which raises the cost. But the server checks only that the
upload is an image file, not that it shows the label, this product, or a different package from
another report's. Sign-up is rate-limited by IP and email (`server/src/auth/rateLimit.ts`), which
slows a script, not a person. A warning needs two families (`CORROBORATION_THRESHOLD.add_caution`),
so **two fabricated families can corroborate a false warning.**

## Why it's contained today

The asymmetry: fakes can only add caution. A false warning costs a parent a second look at a
label. A false all-clear can cost a child.

**Enforced by code, and tested:**
- The only path by which a report reaches another family reads corroborated `add_caution` rows
  only (`server/src/corrections/communityAdditions.ts`). Test: `communityAdditions.test.ts`,
  "excludes rejected, pending, and remove_caution corrections".
- The function that applies them can only raise an allergen to "contains"
  (`server/src/corrections/applyCommunityCorrections.ts`). Test:
  `applyCommunityCorrections.test.ts`, "never clears or downgrades anything".
- A removal changes only the reporter's own view of the scan it was filed from. Test:
  `userScanView.test.ts`, "the reporter's own remove_caution changes only their view".
- A removal never corroborates while a corroborated warning for the same allergen family stands
  (`corroborateClaimIfThresholdMet`).
- A false warning can be undone: an admin rejects its reports, or `COMMUNITY_CORRECTIONS` is
  switched off (`docs/server-setup.md` §11).

**Only by design:**
- A removal reaches status `corroborated` at three families (`CORROBORATION_THRESHOLD.remove_caution`),
  but no code reads that status outside the reporter's own view. Nothing in the code stops a future
  change from adding a reader, and the tests above cover today's paths, not a new one. What keeps
  removals local is the decision of 2026-09-10 (`docs/principles.md`) and the gate below.
- Fakes can still do harm in the safe direction: two of them can put a false warning on a product
  and keep real removals from clearing it until an admin rejects their reports.

## The gate

A corroborated removal may be read outside the reporter's own view only once **both** steps below
exist and are tested. **Neither is built.**

**(a) Count only families with their own scan history.**
- *Would check:* the reporting account scanned other products before the report, over some
  minimum span of days. The scan the report is filed from doesn't count, since every report has
  one. The numbers are not chosen.
- *Wouldn't catch:* a patient person who ages accounts by scanning ordinary products first. It
  adds time, not proof.
- *Costs:* a real new family's first removal reports wouldn't count.

**(b) Flag reports whose photos or origin look like the same hand.**
- *Would check:* reports on the same claim whose photos are the same image or near-duplicates, or
  whose accounts were created close together or from the same network. A flag sends the reports to
  the admin review queue. It decides nothing on its own.
- *Wouldn't catch:* different photos of the same package, or separate phones and networks.
- *Needs first:* reports record no origin today, and sign-up attempts are kept hashed for 24 hours
  for rate limiting only. Keeping origin data on reports is new data about accounts that hold
  children's health information, so `docs/coppa.md`'s minimisation rule has to clear it first.

Neither step proves two accounts are two households. Together they raise the cost, and the review
queue stays the backstop. Tracked in `BACKLOG.md`, deferred until after judging.

## Where this came from

Prof. Yoest asked on October 14: "What stops one determined person from creating a second family
to corroborate themselves?" (`docs/approvals/2026-10-14-yoest-shared-escalations-ask.md`). JT
answered on October 19 — "Nothing structural stops it" — said the required photo only raises the
cost and the asymmetry contains it, and named both hardening steps
(`docs/approvals/2026-10-19-jt-shared-escalations-and-corrections.md`). Prof. Yoest's reply the
same day asked for it to be written down here (`docs/approvals/2026-10-19-yoest-fake-family-page.md`).
