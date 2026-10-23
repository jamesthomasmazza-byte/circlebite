import assert from "node:assert/strict";
import { test } from "node:test";

import type { ReviewQueueReport } from "./api";
import {
  changedByLine,
  circleReportLine,
  circleReporterName,
  heldRemovalNotes,
  priorReportNotice,
  reportableTypes,
  reportCountLine,
  reportErrorMessage,
  reportOutcomeMessage,
  UNCHANGED_BY_YOUR_REPORT,
  yourReportLine,
  yourReportsChangedCard,
} from "./correctionCopy";

test("reportOutcomeMessage: a corroborating add_caution report never claims other reports agreed", () => {
  // The 2026-09-29 live test: one sesame report, and the confirmation said "enough other reports
  // agreed" — there were none. An addition can corroborate on the report that completes the pair.
  const message = reportOutcomeMessage({ correctionType: "flag_missing", corroborated: true, reachesOtherFamilies: true, reachesCircle: false, hasBarcode: true });
  assert.doesNotMatch(message, /other reports/);
  assert.match(message, /now shows for other families/);
});

test("reportOutcomeMessage: an addition never claims to reach other families when the server says it doesn't", () => {
  // COMMUNITY_CORRECTIONS off (principle 4's kill switch): corroborated, but only the reporter sees it.
  const message = reportOutcomeMessage({ correctionType: "flag_missing", corroborated: true, reachesOtherFamilies: false, reachesCircle: false, hasBarcode: true });
  assert.doesNotMatch(message, /other families/);
  assert.match(message, /your own view/);
});

test("reportOutcomeMessage: a corroborated removal says others agreed, and that it's still only the reporter's view", () => {
  for (const correctionType of ["flag_wrong", "wrong_product"] as const) {
    const message = reportOutcomeMessage({ correctionType, corroborated: true, reachesOtherFamilies: false, reachesCircle: false, hasBarcode: true });
    assert.match(message, /enough other reports agreed/);
    assert.match(message, /only changes your own view/);
    assert.match(message, /other families keep seeing it/);
  }
});

test("reportOutcomeMessage: a pending addition says it's on the reporter's own view, never other families'", () => {
  // One family's report, below the threshold of 2 — but the reporter's own card has already changed.
  const message = reportOutcomeMessage({ correctionType: "flag_missing", corroborated: false, reachesOtherFamilies: false, reachesCircle: false, hasBarcode: true });
  assert.match(message, /your own view/);
  assert.match(message, /review queue/);
  assert.doesNotMatch(message, /other families/);
});

test("reportOutcomeMessage: pending and barcode-less reports keep their existing wording", () => {
  assert.equal(
    reportOutcomeMessage({ correctionType: "flag_wrong", corroborated: false, reachesOtherFamilies: false, reachesCircle: false, hasBarcode: true }),
    "Reported — thanks. This is now in the review queue.",
  );
  // A barcode-less report never corroborates, whichever direction it is.
  for (const correctionType of ["flag_missing", "flag_wrong"] as const) {
    assert.match(
      reportOutcomeMessage({ correctionType, corroborated: false, reachesOtherFamilies: false, reachesCircle: false, hasBarcode: false }),
      /without a barcode/,
    );
  }
});

test("yourReportLine: names the allergen, the claim and where the report stands", () => {
  assert.equal(
    yourReportLine({ correctionType: "flag_missing", allergen: "Sesame", status: "corroborated", note: null }),
    "Your report: Sesame is in this product, but wasn't flagged — corroborated",
  );
  assert.equal(
    yourReportLine({ correctionType: "wrong_product", allergen: null, status: "pending", note: "different flavour" }),
    'Your report: this is the wrong product entirely — pending review — "different flavour"',
  );
});

test("yourReportLine: a rejected report says rejected, not pending review", () => {
  // History used to fall through to "pending review" for anything not corroborated — including the
  // report rejected in the 2026-09-29 live test.
  assert.match(yourReportLine({ correctionType: "flag_missing", allergen: "Sesame", status: "rejected", note: null }), /rejected on review$/);
});

function reports(...statuses: ReviewQueueReport["status"][]): ReviewQueueReport[] {
  return statuses.map((status, i) => ({
    id: `r${i}`,
    correctionType: "flag_missing",
    target: "off_data",
    note: null,
    status,
    createdAt: "2026-09-29T12:00:00Z",
    reporterLabel: `Reporter ${i}`,
    rejectedBy: null,
    rejectedAt: null,
    rejectionReason: null,
    origin: "user_initiated",
    refilesRejectedId: null,
    acceptedBy: null,
    acceptedAt: null,
  }));
}

test("reportCountLine: a resolved claim's one rejected report is counted, not '0 reports'", () => {
  // The 2026-09-29 live test: "0 reports — 0 from live accounts" above the one report listed.
  const line = reportCountLine({ liveReporterCount: 0, deletedAccountReportCount: 0, reports: reports("rejected") });
  assert.equal(line, "1 report — rejected.");
  assert.equal(
    reportCountLine({ liveReporterCount: 0, deletedAccountReportCount: 0, reports: reports("rejected", "rejected") }),
    "2 reports — all rejected.",
  );
});

test("reportCountLine: a claim with some reports rejected says how many are still active", () => {
  assert.equal(
    reportCountLine({ liveReporterCount: 2, deletedAccountReportCount: 0, reports: reports("pending", "rejected", "pending") }),
    "3 reports, 2 still active — 2 from live accounts.",
  );
  assert.equal(
    reportCountLine({ liveReporterCount: 1, deletedAccountReportCount: 1, reports: reports("corroborated", "corroborated", "rejected") }),
    "3 reports, 2 still active — 1 from live accounts, 1 from a deleted account.",
  );
});

test("reportCountLine: nothing rejected keeps the existing wording", () => {
  assert.equal(
    reportCountLine({ liveReporterCount: 1, deletedAccountReportCount: 0, reports: reports("corroborated") }),
    "1 report — 1 from live accounts.",
  );
  assert.equal(
    reportCountLine({ liveReporterCount: 2, deletedAccountReportCount: 1, reports: reports("pending", "pending", "pending") }),
    "3 reports — 2 from live accounts, 1 from a deleted account.",
  );
});

test("reportErrorMessage: a duplicate report says so, and never tells the reporter to try again", () => {
  // The 2026-10-01 production 500 — the same sesame claim reported twice.
  const message = reportErrorMessage({ status: 409, code: "already_reported" });
  assert.match(message, /already reported this/);
  assert.doesNotMatch(message, /try again/i);
});

test("reportErrorMessage: nginx's 413 reads the same as the app's own photo_too_large", () => {
  // nginx answers with HTML, so the client only has the status: request_failed_413.
  assert.equal(
    reportErrorMessage({ status: 413, code: "request_failed_413" }),
    reportErrorMessage({ status: 400, code: "photo_too_large" }),
  );
  assert.match(reportErrorMessage({ status: 413, code: "request_failed_413" }), /too large/);
});

test("reportErrorMessage: only an unexplained failure says try again", () => {
  assert.match(reportErrorMessage({ status: 500, code: "internal_error" }), /Try again/);
  assert.match(reportErrorMessage({ status: 0, code: "network" }), /Try again/);
});

test("priorReportNotice: a live report of the same claim blocks a duplicate up front", () => {
  const notice = priorReportNotice(
    [{ allergen: "Sesame", direction: "add_caution", status: "pending", createdAt: "2026-09-29T15:39:44Z" }],
    { correctionType: "flag_missing", allergen: "Sesame" },
  );
  assert.equal(notice?.blocking, true);
  assert.match(notice!.message, /already reported this/);
});

test("priorReportNotice: a rejected report allows a re-file, and says it was reviewed — never why", () => {
  // The 2026-10-01 lockout: sesame reported on Sep 29, rejected the same day.
  const notice = priorReportNotice(
    [{ allergen: "Sesame", direction: "add_caution", status: "rejected", createdAt: "2026-09-29T15:39:44Z" }],
    { correctionType: "flag_missing", allergen: "Sesame" },
  );
  assert.equal(notice?.blocking, false);
  assert.match(notice!.message, /on Sep 29/);
  assert.match(notice!.message, /reviewed and not accepted/);
  assert.match(notice!.message, /report it again/);
});

test("priorReportNotice: a different claim on the same product says nothing", () => {
  const reports = [{ allergen: "Sesame", direction: "add_caution" as const, status: "rejected" as const, createdAt: "2026-09-29T15:39:44Z" }];
  assert.equal(priorReportNotice(reports, { correctionType: "flag_wrong", allergen: "Sesame" }), null, "other direction");
  assert.equal(priorReportNotice(reports, { correctionType: "flag_missing", allergen: "Milk" }), null, "other allergen");
  assert.equal(priorReportNotice([], { correctionType: "wrong_product", allergen: null }), null);
});

test("priorReportNotice: wrong_product matches its own null-allergen claim", () => {
  const notice = priorReportNotice(
    [{ allergen: null, direction: "remove_caution", status: "corroborated", createdAt: "2026-09-29T15:39:44Z" }],
    { correctionType: "wrong_product", allergen: null },
  );
  assert.equal(notice?.blocking, true);
});

test("reportableTypes: a profile's managers can file removals; anyone else only 'it IS in this product'", () => {
  // Prof. Yoest's Oct 1 approval — his babysitter is a follower.
  const managed = [{ id: "owned" }, { id: "co-managed" }];
  assert.deepEqual(reportableTypes(managed, "owned"), ["flag_wrong", "flag_missing", "wrong_product"]);
  assert.deepEqual(reportableTypes(managed, "co-managed"), ["flag_wrong", "flag_missing", "wrong_product"]);
  assert.deepEqual(reportableTypes(managed, "followed"), ["flag_missing"]);
  assert.deepEqual(reportableTypes(managed, null), ["flag_missing"], "unknown profile: the safe default");
});

test("reportErrorMessage: a refused removal says who can file it and what this person still can", () => {
  const message = reportErrorMessage({ status: 403, code: "removal_requires_manager" });
  assert.match(message, /manage this profile/);
  assert.match(message, /can still report one that is/);
  assert.doesNotMatch(message, /try again/i);
});

test("heldRemovalNotes: a removal under a confirmed warning says held, in the parent's own allergen name", () => {
  const notes = heldRemovalNotes(
    [{ correctionType: "flag_wrong", allergen: "Milk", status: "pending" }],
    [{ allergenName: "Milk" }],
  );
  assert.equal(notes.length, 1);
  assert.match(notes[0], /Your request to remove Milk is held/);
  assert.match(notes[0], /A confirmed report of Milk stands on this product/);
  assert.match(notes[0], /A reviewer sees both your request and the warning/);
  // Held is the true state: nobody declined it, and a live report can't be re-filed.
  assert.doesNotMatch(notes[0], /declined|rejected|re-?file|or an ingredient/i);
});

test("heldRemovalNotes: nothing to say without a confirmed warning on that allergen, or once the request was rejected", () => {
  assert.deepEqual(heldRemovalNotes([{ correctionType: "flag_wrong", allergen: "Milk", status: "pending" }], [{ allergenName: "Egg" }]), []);
  assert.deepEqual(heldRemovalNotes([{ correctionType: "flag_wrong", allergen: "Milk", status: "rejected" }], [{ allergenName: "Milk" }]), []);
  assert.deepEqual(heldRemovalNotes([{ correctionType: "flag_missing", allergen: "Milk", status: "pending" }], [{ allergenName: "Milk" }]), []);
});

test("heldRemovalNotes: a wrong-product report under confirmed warnings names each one", () => {
  const [note] = heldRemovalNotes(
    [{ correctionType: "wrong_product", allergen: null, status: "pending" }],
    [{ allergenName: "Milk" }, { allergenName: "Egg" }],
  );
  assert.match(note, /Your report that this is the wrong product is held/);
  assert.match(note, /Confirmed reports of Milk and Egg stand on this product, so those cautions stay/);
});

// Circle reports — Prof. Yoest, 2026-10-14: "when a co-manager sees a pending escalation, how does
// the screen tell them it is one family's report and not yet a corroborated warning?"

const GRANDMA = { name: "Grandma", role: "co_manager" as const, isViewer: false };

test("circleReportLine: who reported it and that they photographed the label, then that no other family has confirmed it", () => {
  assert.equal(
    circleReportLine({ allergenName: "Peanut", reporters: [GRANDMA] }),
    "Grandma (co-manager) reported Peanut present and photographed the label. No other family has confirmed it yet.",
  );
});

test("circleReportLine: never undercuts the photo, repeats the verdict, or explains the mechanics", () => {
  // JT, 2026-10-16, from the rendered card: the photo makes a report evidence; the line above the
  // list already says what changed the verdict; reach and review are the review queue's business.
  const line = circleReportLine({ allergenName: "Peanut", reporters: [GRANDMA] });
  assert.doesNotMatch(line, /say-so|why Peanut shows|Contains|other families (don't )?see|reviewer|shoppers/i);
  assert.equal(line.match(/confirmed/g)?.length, 1, "said once in the line, not again on top of the row");
});

test("circleReportLine: the viewer comes first, as \"You\"", () => {
  const mine = circleReportLine({ allergenName: "Peanut", reporters: [{ ...GRANDMA, isViewer: true }] });
  assert.match(mine, /^You reported Peanut present and photographed the label\./);
  const both = circleReportLine({ allergenName: "Peanut", reporters: [GRANDMA, { name: "Dad", role: "owner", isViewer: true }] });
  assert.match(both, /^You and Grandma \(co-manager\) reported Peanut present/);
});

test("circleReporterName: a deleted account or someone who has left is said so, never guessed", () => {
  assert.equal(circleReporterName(GRANDMA), "Grandma (co-manager)");
  assert.equal(circleReporterName({ ...GRANDMA, role: null }), "Grandma (no longer in this circle)");
  assert.equal(circleReporterName({ ...GRANDMA, name: null, role: null }), "Someone whose account has since been deleted");
});

test("reportOutcomeMessage: a pending addition shared with the circle says so, and that other families don't see it yet", () => {
  const message = reportOutcomeMessage({
    correctionType: "flag_missing",
    corroborated: false,
    reachesOtherFamilies: false,
    reachesCircle: true,
    hasBarcode: true,
  });
  assert.match(message, /everyone who can see this profile/);
  assert.match(message, /Other families see it only once a second family reports it too/);
});

test("changedByLine: names only what changed the card — a circle report alone never says shoppers", () => {
  // History's wording: the line below names who and the photo, the row names the circle.
  assert.equal(changedByLine({ yours: false, shoppers: false, circle: true }), "Changed because of:");
  assert.equal(changedByLine({ yours: true, shoppers: false, circle: false }), "Changed by your report, each with a photo of the label:");
  assert.equal(
    changedByLine({ yours: true, shoppers: true, circle: true }),
    "Changed by your report, shopper reports and a report from your circle, each with a photo of the label:",
  );
});

// 2026-10-23: a report that an allergen isn't there never changes the card; one that it is does.
test("yourReportsChangedCard: only additions and unrejected wrong-product reports change the card", () => {
  assert.equal(yourReportsChangedCard([{ correctionType: "flag_wrong", status: "pending" }]), false);
  assert.equal(yourReportsChangedCard([{ correctionType: "flag_wrong", status: "corroborated" }]), false);
  assert.equal(yourReportsChangedCard([{ correctionType: "flag_missing", status: "pending" }]), true);
  assert.equal(yourReportsChangedCard([{ correctionType: "flag_missing", status: "rejected" }]), true);
  assert.equal(yourReportsChangedCard([{ correctionType: "wrong_product", status: "pending" }]), true);
  assert.equal(yourReportsChangedCard([{ correctionType: "wrong_product", status: "rejected" }]), false);
});

test("UNCHANGED_BY_YOUR_REPORT: one short line, whatever the report's status", () => {
  assert.equal(UNCHANGED_BY_YOUR_REPORT, "Your report hasn't changed it:");
});

test("heldRemovalNotes: a held flag_wrong no longer claims the caution stays only because of the warning", () => {
  const [note] = heldRemovalNotes([{ correctionType: "flag_wrong", allergen: "Milk", status: "pending" }], [{ allergenName: "Milk" }]);
  assert.doesNotMatch(note, /on your card too/);
});
