import assert from "node:assert/strict";
import { after, test } from "node:test";

import type { PoolClient } from "pg";

import { pool } from "../db/pool.js";
import { SEED_EMAIL_DOMAIN } from "../lib/seedMarker.js";
import { loadCommunityAdditions } from "./communityAdditions.js";
import { claimKey } from "./recordCorrection.js";

// Judge worlds (migration 0049), the read side: a judge's confirmed warning never reaches a real
// family's card or history, and a real confirmed warning still reaches every judge. Through
// loadCommunityAdditions — the one loader the live card (applyCommunityCorrectionsIfEnabled) and
// history (userScanView.ts) both read — in a transaction rolled back after each test, since
// judgeSeed.test.ts owns the seed domain for its run.

after(async () => {
  await pool.end();
});

const BARCODE = "2990000000083";
const id = (n: number) => `7e5c0000-0000-0000-0000-${String(n).padStart(12, "0")}`;

// [user, world, their child]
const PEOPLE: [string, number | null, string][] = [
  [id(1), null, id(101)],
  [id(2), null, id(102)],
  [id(11), 1, id(111)],
  [id(12), 1, id(112)],
  [id(21), 2, id(121)],
];
const [REAL_1, REAL_2, JUDGE_1, PRIYA_1, JUDGE_2] = PEOPLE.map(([user]) => user);
const childOf = (user: string) => PEOPLE.find(([u]) => u === user)![2];

async function inTransaction(body: (client: PoolClient) => Promise<void>) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const [user, world, child] of PEOPLE) {
      const email = world === null ? `world-vis-${user}@example.com` : `world-vis-${user}@${SEED_EMAIL_DOMAIN}`;
      await client.query(
        `INSERT INTO users (id, email, password_hash, display_name, age_attested_adult, age_attested_at, judge_world)
         VALUES ($1, $2, 'x', 'World test', true, now(), $3)`,
        [user, email, world],
      );
      await client.query("INSERT INTO allergen_profiles (id, manager_id, label) VALUES ($1, $2, 'Child')", [child, user]);
    }
    await body(client);
  } finally {
    await client.query("ROLLBACK");
    client.release();
  }
}

/** A report already confirmed by the threshold step, from `user`'s own child. */
async function confirmed(client: PoolClient, user: string, allergen: string) {
  await client.query(
    `INSERT INTO product_corrections
       (barcode, reported_by, profile_owner_at_report, correction_type, direction, allergen, target,
        verdict_at_report, photo_path, allergen_fold_key, allergen_family_key, status)
     VALUES ($1, $2, $2, 'flag_missing', 'add_caution', $3, 'off_data', 'safe', 'x.jpg', $4, $5, 'corroborated')`,
    [BARCODE, user, allergen, claimKey(allergen, "remove_caution"), claimKey(allergen, "add_caution")],
  );
}

async function seenBy(client: PoolClient, profileId: string | null) {
  const additions = (await loadCommunityAdditions([BARCODE], profileId, client)).get(BARCODE) ?? [];
  return Object.fromEntries(additions.map((a) => [a.allergen, a.reporterCount]));
}

test("a judge's confirmed warning never reaches a real family; a real one reaches every judge", async () => {
  await inTransaction(async (client) => {
    await confirmed(client, REAL_1, "Peanut");
    await confirmed(client, REAL_2, "Peanut");
    await confirmed(client, JUDGE_1, "Sesame");
    await confirmed(client, PRIYA_1, "Sesame");

    assert.deepEqual(await seenBy(client, childOf(REAL_1)), { Peanut: 2 }, "a real family");
    assert.deepEqual(await seenBy(client, null), { Peanut: 2 }, "no profile reads as real");
    assert.deepEqual(await seenBy(client, childOf(JUDGE_1)), { Peanut: 2, Sesame: 2 }, "the judge's own world, and the real one");
    assert.deepEqual(await seenBy(client, childOf(PRIYA_1)), { Peanut: 2, Sesame: 2 }, "anyone's child in that world");
    assert.deepEqual(await seenBy(client, childOf(JUDGE_2)), { Peanut: 2 }, "another judge's world");
  });
});

test("a profile with no owner left reads as real", async () => {
  await inTransaction(async (client) => {
    await confirmed(client, JUDGE_1, "Sesame");
    await confirmed(client, PRIYA_1, "Sesame");
    assert.deepEqual(await seenBy(client, "7e5c0000-0000-0000-0000-00000000ffff"), {});
  });
});

test("the real query is the one it always was: with no judge rows, a real family sees exactly what the old loader returned", async () => {
  await inTransaction(async (client) => {
    await confirmed(client, REAL_1, "Peanut");
    await confirmed(client, REAL_2, "peanuts");
    const { rows } = await client.query(
      `SELECT barcode, min(allergen) AS allergen, array_agg(id::text ORDER BY created_at, id) AS "correctionIds",
              count(*)::int AS "reporterCount"
       FROM product_corrections
       WHERE barcode = ANY($1) AND direction = 'add_caution' AND status = 'corroborated' AND allergen IS NOT NULL
       GROUP BY barcode, COALESCE(allergen_family_key, 'unkeyed:' || id::text)`,
      [[BARCODE]],
    );
    const old = rows.map(({ barcode: _barcode, ...addition }) => addition);
    assert.deepEqual((await loadCommunityAdditions([BARCODE], childOf(REAL_1), client)).get(BARCODE), old);
  });
});
