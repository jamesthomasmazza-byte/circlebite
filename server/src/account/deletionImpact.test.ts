import assert from "node:assert/strict";
import { after, test } from "node:test";

import { pool } from "../db/pool.js";
import { getDeletionImpact } from "./deletionImpact.js";

// Real Postgres, same discipline as deleteAccount.test.ts.

const usersToClean = new Set<string>();
const profilesToClean = new Set<string>();

async function makeUser(idSuffix: string, email: string): Promise<string> {
  const id = `66660000-0000-0000-0000-${idSuffix}`;
  await pool.query(
    `INSERT INTO users (id, email, password_hash, display_name, age_attested_adult, age_attested_at)
     VALUES ($1, $2, 'x', $2, true, now())`,
    [id, email],
  );
  usersToClean.add(id);
  return id;
}

async function makeProfile(idSuffix: string, managerId: string, label: string): Promise<string> {
  const id = `66660000-0000-0000-0000-${idSuffix}`;
  await pool.query("INSERT INTO allergen_profiles (id, manager_id, label) VALUES ($1, $2, $3)", [
    id,
    managerId,
    label,
  ]);
  profilesToClean.add(id);
  return id;
}

after(async () => {
  await pool.query("DELETE FROM allergen_profiles WHERE id = ANY($1)", [[...profilesToClean]]);
  await pool.query("DELETE FROM users WHERE id = ANY($1)", [[...usersToClean]]);
  await pool.end();
});

test("a profile with a co-manager reports a transfer outcome naming that co-manager", async () => {
  const owner = await makeUser("100000000001", "impact-owner-1@example.com");
  const coManager = await makeUser("100000000002", "impact-comgr-1@example.com");
  const profileId = await makeProfile("100000000003", owner, "Transfers");
  await pool.query("INSERT INTO profile_managers (allergen_profile_id, user_id) VALUES ($1, $2)", [
    profileId,
    coManager,
  ]);

  const impact = await getDeletionImpact(owner);
  assert.equal(impact.length, 1);
  assert.equal(impact[0].outcome.type, "transfer");
  assert.equal((impact[0].outcome as { newOwner: { email: string } }).newOwner.email, "impact-comgr-1@example.com");
});

test("a solo-owned profile with a follower reports a destroy outcome with the follower count", async () => {
  const owner = await makeUser("200000000001", "impact-owner-2@example.com");
  const follower = await makeUser("200000000002", "impact-follower-2@example.com");
  const profileId = await makeProfile("200000000003", owner, "Destroyed");
  await pool.query(
    `INSERT INTO follow_relationships (allergen_profile_id, follower_id, token_hash, status, share_level)
     VALUES ($1, $2, 'impact-test-token-hash-2', 'accepted', 'all')`,
    [profileId, follower],
  );

  const impact = await getDeletionImpact(owner);
  assert.equal(impact.length, 1);
  assert.equal(impact[0].outcome.type, "destroy");
  assert.equal((impact[0].outcome as { followerCount: number }).followerCount, 1);
});
