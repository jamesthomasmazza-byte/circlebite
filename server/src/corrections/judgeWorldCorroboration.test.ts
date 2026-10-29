import assert from "node:assert/strict";
import { after, test } from "node:test";

import type { PoolClient } from "pg";

import { pool } from "../db/pool.js";
import { SEED_EMAIL_DOMAIN } from "../lib/seedMarker.js";
import { claimKey, corroborateClaimIfThresholdMet, countCorroboratingFamilies, type Direction } from "./recordCorrection.js";

// Judge worlds (migration 0049; Prof. Yoest, 2026-10-27, 7:55 PM): every judge scans the same
// barcode, and a judge's reports count only within that judge's world — never toward another
// judge's confirmation, never toward or against a real user's claim. Real users' own thresholds are
// pinned, unchanged, by recordCorrection.test.ts.
//
// Through the real threshold step (countCorroboratingFamilies, corroborateClaimIfThresholdMet), in
// a transaction rolled back after each test: judgeSeed.test.ts owns the seed domain for its run, and
// rows nobody else can see can't collide with it.

after(async () => {
  await pool.end();
});

// Not the seed's shared barcode: a seeded local database already has every world's reports on that one.
const BARCODE = "4900000000083";
const id = (n: number) => `7e5b0000-0000-0000-0000-${String(n).padStart(12, "0")}`;

// Each person owns their own child, so each is their own family.
const REAL_1 = id(1);
const REAL_2 = id(2);
const REAL_3 = id(3);
const JUDGE_1 = id(11);
const PRIYA_1 = id(12); // a second family inside judge 1's world
const JUDGE_2 = id(21);
const PRIYA_2 = id(22);
const SAM_2 = id(23); // a third family in judge 2's world, so a removal there can reach its threshold
const JUDGE_3 = id(31);

const WORLDS: Record<string, number | null> = {
  [REAL_1]: null,
  [REAL_2]: null,
  [REAL_3]: null,
  [JUDGE_1]: 1,
  [PRIYA_1]: 1,
  [JUDGE_2]: 2,
  [PRIYA_2]: 2,
  [SAM_2]: 2,
  [JUDGE_3]: 3,
};

async function inTransaction(body: (client: PoolClient) => Promise<void>) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const [user, world] of Object.entries(WORLDS)) {
      const email = world === null ? `world-corr-${user}@example.com` : `world-corr-${user}@${SEED_EMAIL_DOMAIN}`;
      await client.query(
        `INSERT INTO users (id, email, password_hash, display_name, age_attested_adult, age_attested_at, judge_world)
         VALUES ($1, $2, 'x', 'World test', true, now(), $3)`,
        [user, email, world],
      );
    }
    await body(client);
  } finally {
    await client.query("ROLLBACK");
    client.release();
  }
}

/** `user` reports on their own child. Pending, as recordCorrection writes a new report. */
async function report(client: PoolClient, user: string, direction: Direction, allergen = "Sesame"): Promise<string> {
  const { rows } = await client.query<{ id: string }>(
    `INSERT INTO product_corrections
       (barcode, reported_by, profile_owner_at_report, correction_type, direction, allergen, target,
        verdict_at_report, photo_path, allergen_fold_key, allergen_family_key)
     VALUES ($1, $2, $2, $3, $4, $5, 'off_data', 'safe', 'x.jpg', $6, $7)
     RETURNING id`,
    [
      BARCODE,
      user,
      direction === "add_caution" ? "flag_missing" : "flag_wrong",
      direction,
      allergen,
      claimKey(allergen, "remove_caution"),
      claimKey(allergen, "add_caution"),
    ],
  );
  return rows[0].id;
}

/** The claim the threshold step runs after `user` files — in `user`'s world. */
function claim(user: string, direction: Direction, allergen = "Sesame") {
  return { barcode: BARCODE, key: claimKey(allergen, direction), direction, world: WORLDS[user] };
}

async function statusOf(client: PoolClient, correctionId: string): Promise<string> {
  const { rows } = await client.query<{ status: string }>("SELECT status FROM product_corrections WHERE id = $1", [correctionId]);
  return rows[0].status;
}

test("four judges reporting Sesame on the same barcode are four worlds of one family each — none is confirmed", async () => {
  await inTransaction(async (client) => {
    const ids = [];
    for (const judge of [JUDGE_1, JUDGE_2, JUDGE_3]) {
      ids.push(await report(client, judge, "add_caution"));
      assert.equal(await countCorroboratingFamilies(client, claim(judge, "add_caution")), 1, judge);
      assert.equal(await corroborateClaimIfThresholdMet(client, claim(judge, "add_caution")), false, judge);
    }
    for (const reportId of ids) assert.equal(await statusOf(client, reportId), "pending");

    // Without the worlds, the same rows are three families: the threshold is what the worlds hold off.
    const { rows } = await client.query(
      `SELECT count(DISTINCT profile_owner_at_report)::int AS n FROM product_corrections WHERE id = ANY($1)`,
      [ids],
    );
    assert.equal(rows[0].n, 3);
  });
});

test("a judge's report never counts toward a real claim, and isn't confirmed with it", async () => {
  await inTransaction(async (client) => {
    const judges = await report(client, JUDGE_1, "add_caution");
    const first = await report(client, REAL_1, "add_caution");
    assert.equal(await countCorroboratingFamilies(client, claim(REAL_1, "add_caution")), 1, "the judge isn't a second family");
    assert.equal(await corroborateClaimIfThresholdMet(client, claim(REAL_1, "add_caution")), false);
    assert.equal(await statusOf(client, first), "pending");

    const second = await report(client, REAL_2, "add_caution");
    assert.equal(await corroborateClaimIfThresholdMet(client, claim(REAL_2, "add_caution")), true, "two real families, as always");
    assert.equal(await statusOf(client, first), "corroborated");
    assert.equal(await statusOf(client, second), "corroborated");
    assert.equal(await statusOf(client, judges), "pending", "the judge's report isn't swept up with the real claim");
  });
});

test("inside one judge's world a report behaves normally: two of its families confirm, and only that world's rows", async () => {
  await inTransaction(async (client) => {
    const judges = await report(client, JUDGE_1, "add_caution");
    const priyas = await report(client, PRIYA_1, "add_caution");
    const otherJudge = await report(client, JUDGE_2, "add_caution");
    const real = await report(client, REAL_1, "add_caution");

    assert.equal(await corroborateClaimIfThresholdMet(client, claim(PRIYA_1, "add_caution")), true);
    assert.equal(await statusOf(client, judges), "corroborated");
    assert.equal(await statusOf(client, priyas), "corroborated");
    assert.equal(await statusOf(client, otherJudge), "pending", "another judge's world");
    assert.equal(await statusOf(client, real), "pending", "the real world");
  });
});

test("a judge's confirmed warning never blocks real users' removal", async () => {
  await inTransaction(async (client) => {
    await report(client, JUDGE_1, "add_caution");
    await report(client, PRIYA_1, "add_caution");
    assert.equal(await corroborateClaimIfThresholdMet(client, claim(PRIYA_1, "add_caution")), true);

    for (const user of [REAL_1, REAL_2, REAL_3]) await report(client, user, "remove_caution");
    assert.equal(await corroborateClaimIfThresholdMet(client, claim(REAL_3, "remove_caution")), true);
  });
});

test("a real confirmed warning still blocks a judge world's removal — the warning survives everywhere", async () => {
  await inTransaction(async (client) => {
    await report(client, REAL_1, "add_caution");
    await report(client, REAL_2, "add_caution");
    assert.equal(await corroborateClaimIfThresholdMet(client, claim(REAL_2, "add_caution")), true);

    const removals = [];
    for (const user of [JUDGE_2, PRIYA_2, SAM_2]) removals.push(await report(client, user, "remove_caution"));
    assert.equal(await countCorroboratingFamilies(client, claim(SAM_2, "remove_caution")), 3, "enough families");
    assert.equal(await corroborateClaimIfThresholdMet(client, claim(SAM_2, "remove_caution")), false, "blocked by the real warning");
    for (const removal of removals) assert.equal(await statusOf(client, removal), "pending");
  });
});

test("one judge's confirmed warning doesn't block another judge's removal", async () => {
  await inTransaction(async (client) => {
    await report(client, JUDGE_1, "add_caution");
    await report(client, PRIYA_1, "add_caution");
    assert.equal(await corroborateClaimIfThresholdMet(client, claim(PRIYA_1, "add_caution")), true);

    for (const user of [JUDGE_2, PRIYA_2, SAM_2]) await report(client, user, "remove_caution");
    assert.equal(await corroborateClaimIfThresholdMet(client, claim(SAM_2, "remove_caution")), true);
  });
});
