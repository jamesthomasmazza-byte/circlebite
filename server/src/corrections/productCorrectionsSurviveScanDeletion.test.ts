import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import { pool } from "../db/pool.js";
import { loadCommunityAdditions } from "./communityAdditions.js";

// Migration 0020: product_corrections.scan_id is ON DELETE SET NULL, not CASCADE — a correction is
// evidence about the product/model, not the scan that surfaced it (docs/principles.md N17), and
// must survive the 24-month scan-retention job and account deletion alike. Real Postgres, same
// discipline as communityAdditions.test.ts — distinct ids/barcode so the two can run in parallel.

const USER_G = "99990000-0000-0000-0000-000000000001";
const PROFILE_ID = "99990000-0000-0000-0000-000000000002";
const BARCODE = "4000000000001";

let scanId: string;
let correctionId: string;

before(async () => {
  await pool.query(
    `INSERT INTO users (id, email, password_hash, display_name, age_attested_adult, age_attested_at)
     VALUES ($1, 'scan-id-null-test-g@example.com', 'x', 'G', true, now())`,
    [USER_G],
  );
  await pool.query("INSERT INTO allergen_profiles (id, manager_id, label) VALUES ($1, $2, 'Test Profile')", [
    PROFILE_ID,
    USER_G,
  ]);
  const { rows: scanRows } = await pool.query<{ id: string }>(
    `INSERT INTO scans (allergen_profile_id, barcode, result, matched_allergens) VALUES ($1, $2, 'safe', '[]')
     RETURNING id`,
    [PROFILE_ID, BARCODE],
  );
  scanId = scanRows[0].id;

  const { rows: correctionRows } = await pool.query<{ id: string }>(
    `INSERT INTO product_corrections
       (scan_id, barcode, reported_by, correction_type, direction, allergen, target, verdict_at_report,
        photo_path, status)
     VALUES ($1, $2, $3, 'flag_missing', 'add_caution', 'Peanut', 'off_data', 'safe', 'test.jpg', 'corroborated')
     RETURNING id`,
    [scanId, BARCODE, USER_G],
  );
  correctionId = correctionRows[0].id;
});

after(async () => {
  // The whole point of this file is that deleting the scan does NOT delete the correction row
  // (scan_id just goes null) — so unlike every other corrections test, cascading the user away
  // doesn't clean this one up. Delete it explicitly.
  await pool.query("DELETE FROM product_corrections WHERE id = $1", [correctionId]);
  await pool.query("DELETE FROM users WHERE id = $1", [USER_G]);
  await pool.end();
});

test("deleting a scan sets the correction's scan_id to null instead of deleting the row", async () => {
  await pool.query("DELETE FROM scans WHERE id = $1", [scanId]);

  const { rows } = await pool.query<{ scan_id: string | null; status: string }>(
    "SELECT scan_id, status FROM product_corrections WHERE id = $1",
    [correctionId],
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].scan_id, null);
  assert.equal(rows[0].status, "corroborated");
});

test("loadCommunityAdditions still returns a corroborated correction whose scan was purged", async () => {
  const additions = (await loadCommunityAdditions([BARCODE])).get(BARCODE) ?? [];
  assert.equal(additions.length, 1);
  assert.equal(additions[0].allergen, "Peanut");
  assert.equal(additions[0].reporterCount, 1);
});
