import assert from "node:assert/strict";
import { test } from "node:test";

import type { ReviewQueueClaim } from "../lib/api";
import { claimTitle } from "./ReviewQueue";

// Judge worlds (migration 0049): an admin can tell judge test data from real users' reports, and
// why the same barcode and allergen can appear as several claims.

const claim = (judgeWorld: number | null): ReviewQueueClaim => ({
  barcode: "2990000000083",
  allergen: "Sesame",
  direction: "add_caution",
  status: "pending",
  liveReporterCount: 1,
  deletedAccountReportCount: 0,
  sameCircleWarning: false,
  heldByWarning: [],
  judgeWorld,
  reports: [],
});

test("a real claim's title is unchanged", () => {
  assert.equal(claimTitle(claim(null)), "2990000000083 — Sesame — reported as present");
});

test("a judge world's claim says whose test data it is, and that it's counted apart", () => {
  assert.equal(
    claimTitle(claim(2)),
    "2990000000083 — Sesame — reported as present — judge 2's test data, counted apart from everyone else's",
  );
});
