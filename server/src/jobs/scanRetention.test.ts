import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import { pool } from "../db/pool.js";
import { runScanRetentionPurge } from "./scanRetention.js";

// Real Postgres, same discipline as the corrections tests — real inserts, real cleanup.

const USER_H = "88880000-0000-0000-0000-000000000001";
const PROFILE_ID = "88880000-0000-0000-0000-000000000002";
const OLD_BARCODE = "5000000000001";
const YOUNG_BARCODE = "5000000000002";

let oldScanId: string;
let youngScanId: string;
let correctionOnOldScanId: string;

async function makeScan(barcode: string, createdAt: Date): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO scans (allergen_profile_id, barcode, result, matched_allergens, created_at)
     VALUES ($1, $2, 'safe', '[]', $3) RETURNING id`,
    [PROFILE_ID, barcode, createdAt],
  );
  return rows[0].id;
}

before(async () => {
  await pool.query(
    `INSERT INTO users (id, email, password_hash, display_name, age_attested_adult, age_attested_at)
     VALUES ($1, 'retention-test-h@example.com', 'x', 'H', true, now())`,
    [USER_H],
  );
  await pool.query("INSERT INTO allergen_profiles (id, manager_id, label) VALUES ($1, $2, 'Test Profile')", [
    PROFILE_ID,
    USER_H,
  ]);

  const twentyFiveMonthsAgo = new Date();
  twentyFiveMonthsAgo.setMonth(twentyFiveMonthsAgo.getMonth() - 25);
  oldScanId = await makeScan(OLD_BARCODE, twentyFiveMonthsAgo);

  const oneMonthAgo = new Date();
  oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
  youngScanId = await makeScan(YOUNG_BARCODE, oneMonthAgo);

  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO product_corrections
       (scan_id, barcode, reported_by, correction_type, direction, allergen, target, verdict_at_report,
        photo_path, status)
     VALUES ($1, $2, $3, 'flag_missing', 'add_caution', 'Milk', 'off_data', 'safe', 'test.jpg', 'corroborated')
     RETURNING id`,
    [oldScanId, OLD_BARCODE, USER_H],
  );
  correctionOnOldScanId = rows[0].id;
});

after(async () => {
  await pool.query("DELETE FROM product_corrections WHERE id = $1", [correctionOnOldScanId]);
  await pool.query("DELETE FROM scans WHERE id = $1", [youngScanId]);
  await pool.query("DELETE FROM users WHERE id = $1", [USER_H]);
  await pool.query("DELETE FROM retention_runs WHERE job_name = 'scan_retention'");
  await pool.end();
});

test("purges scans older than 24 months, keeps younger ones, and survives their corrections with scan_id null", async () => {
  const result = await runScanRetentionPurge();

  assert.equal(result.status, "ok");
  assert.ok((result.rowsDeleted ?? 0) >= 1);

  const { rows: remaining } = await pool.query<{ id: string }>("SELECT id FROM scans WHERE id = ANY($1)", [
    [oldScanId, youngScanId],
  ]);
  assert.deepEqual(
    remaining.map((r) => r.id).sort(),
    [youngScanId].sort(),
  );

  const { rows: correctionRows } = await pool.query<{ scan_id: string | null; status: string }>(
    "SELECT scan_id, status FROM product_corrections WHERE id = $1",
    [correctionOnOldScanId],
  );
  assert.equal(correctionRows[0].scan_id, null);
  assert.equal(correctionRows[0].status, "corroborated");
});

test("records the run in retention_runs, success or failure", async () => {
  const { rows } = await pool.query<{ status: string; rows_deleted: number | null; error_message: string | null }>(
    "SELECT status, rows_deleted, error_message FROM retention_runs WHERE job_name = 'scan_retention' ORDER BY started_at DESC LIMIT 1",
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].status, "ok");
  assert.ok((rows[0].rows_deleted ?? 0) >= 1);
  assert.equal(rows[0].error_message, null);
});
