import assert from "node:assert/strict";
import { test } from "node:test";

import type { ReviewQueueReport } from "./api";
import { reportCountLine, reportOutcomeMessage, yourReportLine } from "./correctionCopy";

test("reportOutcomeMessage: a first add_caution report never claims other reports agreed", () => {
  // The 2026-09-29 live test: one sesame report, and the confirmation said "enough other reports
  // agreed" — there were none. An addition corroborates on its first report (threshold 1).
  const message = reportOutcomeMessage({ correctionType: "flag_missing", corroborated: true, hasBarcode: true });
  assert.doesNotMatch(message, /other reports/);
  assert.match(message, /now shows for other families/);
});

test("reportOutcomeMessage: a corroborated removal says others agreed, and that it's still only the reporter's view", () => {
  for (const correctionType of ["flag_wrong", "wrong_product"] as const) {
    const message = reportOutcomeMessage({ correctionType, corroborated: true, hasBarcode: true });
    assert.match(message, /enough other reports agreed/);
    assert.match(message, /only changes your own view/);
    assert.match(message, /other families keep seeing it/);
  }
});

test("reportOutcomeMessage: pending and barcode-less reports keep their existing wording", () => {
  assert.equal(
    reportOutcomeMessage({ correctionType: "flag_wrong", corroborated: false, hasBarcode: true }),
    "Reported — thanks. This is now in the review queue.",
  );
  // A barcode-less report never corroborates, whichever direction it is.
  for (const correctionType of ["flag_missing", "flag_wrong"] as const) {
    assert.match(reportOutcomeMessage({ correctionType, corroborated: false, hasBarcode: false }), /without a barcode/);
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
