import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import { assertIsAdmin } from "../authorization/admin.js";
import { pool } from "../db/pool.js";
import { HttpError } from "../lib/httpError.js";
import { aggregateNpsResponses, classify, npsReport, NPS_SMALL_SAMPLE_THRESHOLD } from "./npsReport.js";

// ---------------------------------------------------------------------------------------------
// Pure aggregation math — no DB needed. Mirrors aiAccuracyReport.test.ts's aggregateEscalations
// tests.
// ---------------------------------------------------------------------------------------------

test("classify: boundaries land in the right bucket", () => {
  assert.equal(classify(10), "promoter");
  assert.equal(classify(9), "promoter");
  assert.equal(classify(8), "passive");
  assert.equal(classify(7), "passive");
  assert.equal(classify(6), "detractor");
  assert.equal(classify(0), "detractor");
});

test("aggregateNpsResponses: below the threshold, npsScore is null but counts are exact", () => {
  const rows = [
    { score: 10, reason: null, source: "user" as const },
    { score: 3, reason: null, source: "user" as const },
  ];
  const result = aggregateNpsResponses(rows);
  assert.equal(result.n, 2);
  assert.equal(result.promoters, 1);
  assert.equal(result.detractors, 1);
  assert.equal(result.npsScore, null);
  assert.equal(result.seedCarriedScore, false);
});

test("aggregateNpsResponses: npsScore appears once responses reach the threshold", () => {
  // 15 promoters, 5 detractors, n = 20 -> (15 - 5) / 20 * 100 = 50
  const rows = [
    ...Array.from({ length: 15 }, () => ({ score: 10, reason: null, source: "user" as const })),
    ...Array.from({ length: 5 }, () => ({ score: 0, reason: null, source: "user" as const })),
  ];
  assert.equal(rows.length, NPS_SMALL_SAMPLE_THRESHOLD);

  const result = aggregateNpsResponses(rows);
  assert.equal(result.n, NPS_SMALL_SAMPLE_THRESHOLD);
  assert.equal(result.promoters, 15);
  assert.equal(result.detractors, 5);
  assert.equal(result.npsScore, 50);
});

test("aggregateNpsResponses: passives don't affect npsScore, only n", () => {
  const rows = [
    ...Array.from({ length: 10 }, () => ({ score: 10, reason: null, source: "user" as const })),
    ...Array.from({ length: 10 }, () => ({ score: 8, reason: null, source: "user" as const })), // passives
  ];
  const result = aggregateNpsResponses(rows);
  assert.equal(result.n, 20);
  assert.equal(result.promoters, 10);
  assert.equal(result.passives, 10);
  assert.equal(result.detractors, 0);
  assert.equal(result.npsScore, 50); // (10 - 0) / 20 * 100
});

test("aggregateNpsResponses: reasons are trimmed, verbatim, and exclude empty/whitespace-only values", () => {
  const rows = [
    { score: 9, reason: "  Love the disclaimer  ", source: "user" as const },
    { score: 2, reason: "", source: "user" as const },
    { score: 7, reason: "   ", source: "user" as const },
    { score: 10, reason: null, source: "user" as const },
    { score: 1, reason: "Too slow", source: "user" as const },
  ];
  const result = aggregateNpsResponses(rows);
  assert.deepEqual(result.reasons, ["Love the disclaimer", "Too slow"]);
});

test("aggregateNpsResponses: composition counts split real from seeded rows", () => {
  const rows = [
    { score: 10, reason: null, source: "user" as const },
    { score: 10, reason: null, source: "user" as const },
    { score: 10, reason: null, source: "seed" as const },
  ];
  const result = aggregateNpsResponses(rows);
  assert.equal(result.n, 3);
  assert.equal(result.realCount, 2);
  assert.equal(result.seededCount, 1);
});

test("aggregateNpsResponses: seedCarriedScore is true when real responses alone are below threshold but seeded rows push n over it", () => {
  const rows = [
    ...Array.from({ length: 5 }, () => ({ score: 10, reason: null, source: "user" as const })),
    ...Array.from({ length: 15 }, () => ({ score: 10, reason: null, source: "seed" as const })),
  ];
  const result = aggregateNpsResponses(rows);
  assert.equal(result.n, 20);
  assert.equal(result.realCount, 5);
  assert.equal(result.seededCount, 15);
  assert.notEqual(result.npsScore, null);
  assert.equal(result.seedCarriedScore, true);
});

test("aggregateNpsResponses: seedCarriedScore is false once real responses alone reach the threshold, even with seeded rows present", () => {
  const rows = [
    ...Array.from({ length: 20 }, () => ({ score: 10, reason: null, source: "user" as const })),
    ...Array.from({ length: 5 }, () => ({ score: 10, reason: null, source: "seed" as const })),
  ];
  const result = aggregateNpsResponses(rows);
  assert.equal(result.realCount, 20);
  assert.equal(result.seedCarriedScore, false);
});

test("aggregateNpsResponses: seedCarriedScore is false below threshold even if seeded rows are present (npsScore is already null)", () => {
  const rows = [
    { score: 10, reason: null, source: "user" as const },
    { score: 10, reason: null, source: "seed" as const },
  ];
  const result = aggregateNpsResponses(rows);
  assert.equal(result.npsScore, null);
  assert.equal(result.seedCarriedScore, false);
});

// ---------------------------------------------------------------------------------------------
// Real Postgres — source filtering and the admin gate.
// ---------------------------------------------------------------------------------------------

const USER_A = "eeeeeeee-0000-0000-0000-000000000001";
const NON_ADMIN = "eeeeeeee-0000-0000-0000-000000000002";

let insertedResponseIds: string[] = [];

before(async () => {
  await pool.query(
    `INSERT INTO users (id, email, password_hash, display_name, age_attested_adult, age_attested_at) VALUES
       ($1, 'nps-report-a@example.com', 'x', 'A', true, now()),
       ($2, 'nps-report-non-admin@example.com', 'x', 'Non-admin', true, now())`,
    [USER_A, NON_ADMIN],
  );
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO nps_responses (user_id, score, reason, source) VALUES
       ($1, 10, 'real response', 'user'),
       (NULL, 9, 'seeded response', 'seed')
     RETURNING id`,
    [USER_A],
  );
  insertedResponseIds = rows.map((r) => r.id);
});

after(async () => {
  // Deleted by the exact ids this file inserted, not by user_id/source — a source = 'seed' filter
  // would also match the real judge seed script's rows in a dev DB that's already been seeded.
  await pool.query("DELETE FROM nps_responses WHERE id = ANY($1)", [insertedResponseIds]);
  await pool.query("DELETE FROM users WHERE id = ANY($1)", [[USER_A, NON_ADMIN]]);
  await pool.end();
});

test("npsReport: includes seeded rows by default", async () => {
  const report = await npsReport();
  assert.ok(report.n >= 2);
  assert.ok(report.realCount >= 1);
  assert.ok(report.seededCount >= 1);
  assert.equal(report.realCount + report.seededCount, report.n);
});

test("npsReport: includeSeeded false excludes source='seed' rows", async () => {
  const report = await npsReport(false);
  assert.ok(!report.reasons.includes("seeded response"));
  assert.equal(report.seededCount, 0);
});

test("assertIsAdmin: non-admin is blocked with 404, not 403 — same contract as /admin/ai-accuracy and /admin/review-queue", async () => {
  await assert.rejects(
    () => assertIsAdmin(NON_ADMIN),
    (err: unknown) => err instanceof HttpError && err.status === 404,
  );
});
