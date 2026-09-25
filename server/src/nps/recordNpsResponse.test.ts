import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import { pool } from "../db/pool.js";
import { HttpError } from "../lib/httpError.js";
import { getCurrentNpsResponse, recordNpsResponse } from "./recordNpsResponse.js";

// Real Postgres, same discipline as reviewQueue.test.ts / aiAccuracyReport.test.ts: real inserts,
// real cleanup, invented data only (@example.com addresses — AGENTS.md). "dddddddd-" id prefix so
// this file can run alongside the others under `node --test` without colliding.

const USER_A = "dddddddd-0000-0000-0000-000000000001";
const USER_B = "dddddddd-0000-0000-0000-000000000002";

async function insertResponse(userId: string, score: number, daysAgo: number): Promise<void> {
  await pool.query(
    `INSERT INTO nps_responses (user_id, score, reason, created_at)
     VALUES ($1, $2, 'backdated fixture', now() - ($3 || ' days')::interval)`,
    [userId, score, daysAgo],
  );
}

before(async () => {
  await pool.query(
    `INSERT INTO users (id, email, password_hash, display_name, age_attested_adult, age_attested_at) VALUES
       ($1, 'nps-record-a@example.com', 'x', 'A', true, now()),
       ($2, 'nps-record-b@example.com', 'x', 'B', true, now())`,
    [USER_A, USER_B],
  );
});

after(async () => {
  // nps_responses.user_id is ON DELETE SET NULL (migration 0024), not CASCADE — clean these up
  // explicitly first, or they'd be left behind as orphaned rows on every run, same discipline as
  // aiAccuracyReport.test.ts's product_corrections cleanup.
  await pool.query("DELETE FROM nps_responses WHERE user_id = ANY($1)", [[USER_A, USER_B]]);
  await pool.query("DELETE FROM users WHERE id = ANY($1)", [[USER_A, USER_B]]);
  await pool.end();
});

test("recordNpsResponse: rejects an out-of-range score before hitting the DB", async () => {
  await assert.rejects(
    () => recordNpsResponse(USER_A, 11, null),
    (err: unknown) => err instanceof HttpError && err.status === 400,
  );
  await assert.rejects(
    () => recordNpsResponse(USER_A, -1, null),
    (err: unknown) => err instanceof HttpError && err.status === 400,
  );
});

test("nps_responses CHECK constraint: the DB itself rejects an out-of-range score", async () => {
  await assert.rejects(() =>
    pool.query("INSERT INTO nps_responses (user_id, score) VALUES ($1, 11)", [USER_A]),
  );
});

test("recordNpsResponse: succeeds and is readable via getCurrentNpsResponse", async () => {
  const response = await recordNpsResponse(USER_A, 9, "Great app");
  assert.equal(response.score, 9);
  assert.equal(response.reason, "Great app");

  const current = await getCurrentNpsResponse(USER_A);
  assert.equal(current?.id, response.id);
});

test("recordNpsResponse: a second response within 90 days is rejected with 409", async () => {
  await assert.rejects(
    () => recordNpsResponse(USER_A, 5, null),
    (err: unknown) => err instanceof HttpError && err.status === 409 && err.code === "already_responded",
  );
});

test("recordNpsResponse: a response is allowed again once the prior one is more than 90 days old", async () => {
  await insertResponse(USER_B, 3, 91);
  assert.equal(await getCurrentNpsResponse(USER_B), null);

  const response = await recordNpsResponse(USER_B, 8, null);
  assert.equal(response.score, 8);
});

test("recordNpsResponse: a response from exactly 10 days ago still blocks a new one", async () => {
  await pool.query("DELETE FROM nps_responses WHERE user_id = $1", [USER_B]);
  await insertResponse(USER_B, 4, 10);

  const current = await getCurrentNpsResponse(USER_B);
  assert.ok(current);

  await assert.rejects(
    () => recordNpsResponse(USER_B, 7, null),
    (err: unknown) => err instanceof HttpError && err.status === 409,
  );
});
