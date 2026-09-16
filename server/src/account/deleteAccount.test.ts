import assert from "node:assert/strict";
import { after, test } from "node:test";

import { pool } from "../db/pool.js";
import { deleteAccount } from "./deleteAccount.js";

// Real Postgres, same discipline as the corrections tests. Each test seeds and cleans up its own
// fixture rather than sharing one, since deleteAccount's whole point is changing ownership, and a
// shared fixture across tests would make each test's starting state depend on execution order.

const usersToClean = new Set<string>();
const profilesToClean = new Set<string>();
const correctionsToClean = new Set<string>();

async function makeUser(idSuffix: string, email: string): Promise<string> {
  const id = `77770000-0000-0000-0000-${idSuffix}`;
  await pool.query(
    `INSERT INTO users (id, email, password_hash, display_name, age_attested_adult, age_attested_at)
     VALUES ($1, $2, 'x', $2, true, now())`,
    [id, email],
  );
  usersToClean.add(id);
  return id;
}

async function makeProfile(idSuffix: string, managerId: string): Promise<string> {
  const id = `77770000-0000-0000-0000-${idSuffix}`;
  await pool.query("INSERT INTO allergen_profiles (id, manager_id, label) VALUES ($1, $2, 'Test Profile')", [
    id,
    managerId,
  ]);
  profilesToClean.add(id);
  return id;
}

async function addCoManager(profileId: string, userId: string, addedAt: Date): Promise<void> {
  await pool.query(
    "INSERT INTO profile_managers (allergen_profile_id, user_id, added_at) VALUES ($1, $2, $3)",
    [profileId, userId, addedAt],
  );
}

async function addFollower(profileId: string, userId: string, tokenHash: string): Promise<void> {
  await pool.query(
    `INSERT INTO follow_relationships (allergen_profile_id, follower_id, token_hash, status, share_level)
     VALUES ($1, $2, $3, 'accepted', 'all')`,
    [profileId, userId, tokenHash],
  );
}

async function addScanWithCorrection(profileId: string, barcode: string, reportedBy: string): Promise<{ scanId: string; correctionId: string }> {
  const { rows: scanRows } = await pool.query<{ id: string }>(
    "INSERT INTO scans (allergen_profile_id, barcode, result, matched_allergens) VALUES ($1, $2, 'safe', '[]') RETURNING id",
    [profileId, barcode],
  );
  const scanId = scanRows[0].id;
  const { rows: correctionRows } = await pool.query<{ id: string }>(
    `INSERT INTO product_corrections
       (scan_id, barcode, reported_by, correction_type, direction, allergen, target, verdict_at_report,
        photo_path, status)
     VALUES ($1, $2, $3, 'flag_missing', 'add_caution', 'Milk', 'off_data', 'safe', 'test.jpg', 'corroborated')
     RETURNING id`,
    [scanId, barcode, reportedBy],
  );
  const correctionId = correctionRows[0].id;
  correctionsToClean.add(correctionId);
  return { scanId, correctionId };
}

after(async () => {
  // Corrections outlive their scan (migration 0020), and reported_by/scan_id may already be null
  // by the time this runs (deleteAccount() nulls them on the very users/scans this file is about
  // to delete) — clean up by the correction's own id, tracked as each one is created, rather than
  // trying to find it again afterward.
  await pool.query("DELETE FROM product_corrections WHERE id = ANY($1)", [[...correctionsToClean]]);
  await pool.query("DELETE FROM allergen_profiles WHERE id = ANY($1)", [[...profilesToClean]]);
  await pool.query("DELETE FROM users WHERE id = ANY($1)", [[...usersToClean]]);
  await pool.end();
});

test("transfers a co-managed profile to the longest-standing co-manager, leaving other co-managers, followers, and its scans/corrections untouched", async () => {
  const owner = await makeUser("100000000001", "delacct-owner-1@example.com");
  const coManagerOld = await makeUser("100000000002", "delacct-comgr-old@example.com");
  const coManagerNew = await makeUser("100000000003", "delacct-comgr-new@example.com");
  const follower = await makeUser("100000000004", "delacct-follower-1@example.com");
  const profileId = await makeProfile("100000000005", owner);

  const earlier = new Date(Date.now() - 60_000);
  const later = new Date(Date.now() - 30_000);
  await addCoManager(profileId, coManagerOld, earlier);
  await addCoManager(profileId, coManagerNew, later);
  await addFollower(profileId, follower, "delacct-test-token-hash-1");
  const { scanId, correctionId } = await addScanWithCorrection(profileId, "6000000000001", owner);

  await deleteAccount(owner);

  const { rows: profileRows } = await pool.query<{ manager_id: string }>(
    "SELECT manager_id FROM allergen_profiles WHERE id = $1",
    [profileId],
  );
  assert.equal(profileRows.length, 1, "profile must survive");
  assert.equal(profileRows[0].manager_id, coManagerOld);

  const { rows: managerRows } = await pool.query<{ user_id: string }>(
    "SELECT user_id FROM profile_managers WHERE allergen_profile_id = $1",
    [profileId],
  );
  assert.deepEqual(
    managerRows.map((r) => r.user_id),
    [coManagerNew],
    "the promoted co-manager's own membership row is gone; the other co-manager's is untouched",
  );

  const { rows: followRows } = await pool.query("SELECT id FROM follow_relationships WHERE allergen_profile_id = $1", [
    profileId,
  ]);
  assert.equal(followRows.length, 1, "the follower is untouched");

  const { rows: scanRows } = await pool.query("SELECT id FROM scans WHERE id = $1", [scanId]);
  assert.equal(scanRows.length, 1, "the profile's scan is untouched");

  const { rows: correctionRows } = await pool.query<{ scan_id: string | null }>(
    "SELECT scan_id FROM product_corrections WHERE id = $1",
    [correctionId],
  );
  assert.equal(correctionRows[0].scan_id, scanId, "the correction is untouched");

  const { rows: userRows } = await pool.query("SELECT id FROM users WHERE id = $1", [owner]);
  assert.equal(userRows.length, 0, "the deleted owner's own row is gone");
});

test("destroys a solo-owned profile with no co-manager, but its correction survives with scan_id null", async () => {
  const soloOwner = await makeUser("200000000001", "delacct-solo-owner@example.com");
  const profileId = await makeProfile("200000000002", soloOwner);
  const { scanId, correctionId } = await addScanWithCorrection(profileId, "6000000000002", soloOwner);

  await deleteAccount(soloOwner);

  const { rows: profileRows } = await pool.query("SELECT id FROM allergen_profiles WHERE id = $1", [profileId]);
  assert.equal(profileRows.length, 0, "the solo-owned profile is destroyed");

  const { rows: scanRows } = await pool.query("SELECT id FROM scans WHERE id = $1", [scanId]);
  assert.equal(scanRows.length, 0, "its scan is destroyed with it");

  const { rows: correctionRows } = await pool.query<{ scan_id: string | null; status: string }>(
    "SELECT scan_id, status FROM product_corrections WHERE id = $1",
    [correctionId],
  );
  assert.equal(correctionRows.length, 1, "the correction survives");
  assert.equal(correctionRows[0].scan_id, null);
  assert.equal(correctionRows[0].status, "corroborated");
});

test("a co-manager deleting their own account only removes their own membership, leaving the profile and its owner untouched", async () => {
  const owner = await makeUser("300000000001", "delacct-owner-2@example.com");
  const coManager = await makeUser("300000000002", "delacct-comgr-2@example.com");
  const profileId = await makeProfile("300000000003", owner);
  await addCoManager(profileId, coManager, new Date());

  await deleteAccount(coManager);

  const { rows: profileRows } = await pool.query<{ manager_id: string }>(
    "SELECT manager_id FROM allergen_profiles WHERE id = $1",
    [profileId],
  );
  assert.equal(profileRows.length, 1);
  assert.equal(profileRows[0].manager_id, owner, "ownership is untouched");

  const { rows: managerRows } = await pool.query("SELECT user_id FROM profile_managers WHERE allergen_profile_id = $1", [
    profileId,
  ]);
  assert.equal(managerRows.length, 0, "the departing co-manager's own row is gone");

  const { rows: ownerRows } = await pool.query("SELECT id FROM users WHERE id = $1", [owner]);
  assert.equal(ownerRows.length, 1, "the owner's own account is untouched");
});
