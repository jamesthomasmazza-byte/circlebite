import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import { pool } from "../db/pool.js";
import { loadCommunityAdditions } from "./communityAdditions.js";

// Real Postgres, same discipline as recordCorrection.test.ts: real inserts, real cleanup. Ids and
// barcodes are distinct from that file's so the two can run in parallel under `node --test`.
// Invented data only.

const USER_D = "dddddddd-0000-0000-0000-000000000001";
const USER_E = "dddddddd-0000-0000-0000-000000000002";
const USER_F = "dddddddd-0000-0000-0000-000000000003";
const PROFILE_ID = "eeeeeeee-0000-0000-0000-000000000001";
const BARCODE_1 = "2000000000001";
const BARCODE_2 = "2000000000002";
const BARCODE_EMPTY = "2000000000003";

async function insertCorrection(
  scanId: string,
  barcode: string,
  reportedBy: string,
  correctionType: string,
  direction: string,
  allergen: string,
  status: string,
): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO product_corrections
       (scan_id, barcode, reported_by, correction_type, direction, allergen, target, verdict_at_report, photo_path, status)
     VALUES ($1, $2, $3, $4, $5, $6, 'off_data', 'safe', 'test.jpg', $7) RETURNING id`,
    [scanId, barcode, reportedBy, correctionType, direction, allergen, status],
  );
  return rows[0].id;
}

let sesameIds: string[] = [];

before(async () => {
  await pool.query(
    `INSERT INTO users (id, email, password_hash, display_name, age_attested_adult, age_attested_at) VALUES
       ($1, 'community-test-d@example.com', 'x', 'D', true, now()),
       ($2, 'community-test-e@example.com', 'x', 'E', true, now()),
       ($3, 'community-test-f@example.com', 'x', 'F', true, now())`,
    [USER_D, USER_E, USER_F],
  );
  await pool.query("INSERT INTO allergen_profiles (id, manager_id, label) VALUES ($1, $2, 'Test Profile')", [
    PROFILE_ID,
    USER_D,
  ]);
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO scans (allergen_profile_id, barcode, result, matched_allergens) VALUES
       ($1, $2, 'safe', '[]'), ($1, $3, 'safe', '[]') RETURNING id`,
    [PROFILE_ID, BARCODE_1, BARCODE_2],
  );
  const [scan1, scan2] = rows.map((r) => r.id);

  // Two reporters, two spellings, one claim.
  sesameIds = [
    await insertCorrection(scan1, BARCODE_1, USER_D, "flag_missing", "add_caution", "Sesame", "corroborated"),
    await insertCorrection(scan1, BARCODE_1, USER_E, "flag_missing", "add_caution", "sesame", "corroborated"),
  ];
  // Each of these must be excluded.
  await insertCorrection(scan1, BARCODE_1, USER_E, "flag_missing", "add_caution", "Mustard", "rejected");
  await insertCorrection(scan1, BARCODE_1, USER_F, "flag_missing", "add_caution", "Celery", "pending");
  await insertCorrection(scan1, BARCODE_1, USER_D, "flag_wrong", "remove_caution", "Egg", "corroborated");
  // A reporter who later deletes their account still counts — the report is evidence about the
  // product, not about them.
  await insertCorrection(scan2, BARCODE_2, USER_F, "flag_missing", "add_caution", "Soy", "corroborated");
  await pool.query("DELETE FROM users WHERE id = $1", [USER_F]);
});

after(async () => {
  await pool.query("DELETE FROM users WHERE id = ANY($1)", [[USER_D, USER_E, USER_F]]);
  await pool.end();
});

test("groups a claim case-insensitively and counts its reporters", async () => {
  const additions = (await loadCommunityAdditions([BARCODE_1])).get(BARCODE_1) ?? [];
  assert.equal(additions.length, 1);
  assert.equal(additions[0].allergen.toLowerCase(), "sesame");
  assert.equal(additions[0].reporterCount, 2);
  assert.deepEqual([...additions[0].correctionIds].sort(), [...sesameIds].sort());
});

test("excludes rejected, pending, and remove_caution corrections", async () => {
  const names = ((await loadCommunityAdditions([BARCODE_1])).get(BARCODE_1) ?? []).map((a) => a.allergen.toLowerCase());
  assert.equal(names.includes("mustard"), false); // rejected — the per-report undo
  assert.equal(names.includes("celery"), false); // pending
  assert.equal(names.includes("egg"), false); // a corroborated removal never propagates
});

test("still counts a report whose reporter deleted their account", async () => {
  const additions = (await loadCommunityAdditions([BARCODE_2])).get(BARCODE_2) ?? [];
  assert.equal(additions.length, 1);
  assert.equal(additions[0].allergen, "Soy");
  assert.equal(additions[0].reporterCount, 1);
});

test("loads several barcodes in one call and leaves a barcode with no reports out of the map", async () => {
  const byBarcode = await loadCommunityAdditions([BARCODE_1, BARCODE_2, BARCODE_EMPTY]);
  assert.equal(byBarcode.has(BARCODE_1), true);
  assert.equal(byBarcode.has(BARCODE_2), true);
  assert.equal(byBarcode.has(BARCODE_EMPTY), false);
});

test("an empty barcode list returns an empty map without querying", async () => {
  assert.equal((await loadCommunityAdditions([])).size, 0);
});
