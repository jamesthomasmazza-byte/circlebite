import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { after, test } from "node:test";

import type { PoolClient } from "pg";

import { SEED_EMAIL_DOMAIN } from "../lib/seedMarker.js";
import { pool } from "./pool.js";

// Migration 0049: how a judge world is marked, and that nothing a real user does can set it.
// Every test runs in a transaction it rolls back: judgeSeed.test.ts owns the seed domain for its
// run, and rows nobody else can see can't collide with it.

after(async () => {
  await pool.end();
});

async function inTransaction(body: (client: PoolClient) => Promise<void>) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await body(client);
  } finally {
    await client.query("ROLLBACK");
    client.release();
  }
}

const REAL = "7e5a0000-0000-0000-0000-000000000001";
const JUDGE_1 = "7e5a0000-0000-0000-0000-000000000002";
const JUDGE_2 = "7e5a0000-0000-0000-0000-000000000003";

async function addUser(client: PoolClient, id: string, email: string, world: number | null) {
  await client.query(
    `INSERT INTO users (id, email, password_hash, display_name, age_attested_adult, age_attested_at, judge_world)
     VALUES ($1, $2, 'x', 'World test', true, now(), $3)`,
    [id, email, world],
  );
}

async function addPeople(client: PoolClient) {
  await addUser(client, REAL, "world-test-real@example.com", null);
  await addUser(client, JUDGE_1, `world-test-1@${SEED_EMAIL_DOMAIN}`, 1);
  await addUser(client, JUDGE_2, `world-test-2@${SEED_EMAIL_DOMAIN}`, 2);
}

let nextBarcode = 4900000000001;

/** A report as the table stores one, each on its own barcode; returns the world the trigger gave it. */
async function report(client: PoolClient, reportedBy: string | null, owner: string | null, suppliedWorld: number | null = null) {
  const { rows } = await client.query<{ id: string; judge_world_at_report: number | null }>(
    `INSERT INTO product_corrections
       (barcode, reported_by, profile_owner_at_report, correction_type, direction, allergen, target,
        verdict_at_report, photo_path, allergen_fold_key, allergen_family_key, judge_world_at_report)
     VALUES ($4, $1, $2, 'flag_missing', 'add_caution', 'Sesame', 'off_data', 'safe', 'x.jpg',
             'sesame', 'sesame', $3)
     RETURNING id, judge_world_at_report`,
    [reportedBy, owner, suppliedWorld, String(nextBarcode++)],
  );
  return rows[0];
}

test("a world is only ever on the seed's reserved domain, which signup refuses", async () => {
  await inTransaction(async (client) => {
    await addUser(client, JUDGE_1, `world-test-1@${SEED_EMAIL_DOMAIN}`, 1);
    await client.query("SAVEPOINT s");
    await assert.rejects(addUser(client, REAL, "world-test-real@example.com", 1), { code: "23514" });
    await client.query("ROLLBACK TO SAVEPOINT s");
    await addUser(client, REAL, "world-test-real@example.com", null);
    await assert.rejects(client.query("UPDATE users SET judge_world = 2 WHERE id = $1", [REAL]), { code: "23514" });
  });
});

test("a real user's report on a real profile has no world", async () => {
  await inTransaction(async (client) => {
    await addPeople(client);
    assert.equal((await report(client, REAL, REAL)).judge_world_at_report, null);
  });
});

test("a judge's report is in the judge's world, on any profile; a real person on a judge's profile files into that judge's", async () => {
  await inTransaction(async (client) => {
    await addPeople(client);
    assert.equal((await report(client, JUDGE_1, JUDGE_1)).judge_world_at_report, 1);
    assert.equal((await report(client, JUDGE_1, REAL)).judge_world_at_report, 1);
    assert.equal((await report(client, JUDGE_1, JUDGE_2)).judge_world_at_report, 1, "the reporter's world first");
    assert.equal((await report(client, REAL, JUDGE_2)).judge_world_at_report, 2);
    assert.equal((await report(client, null, JUDGE_2)).judge_world_at_report, 2, "a deleted reporter: the owner's world");
  });
});

test("the trigger overwrites a world the INSERT supplies, and refuses any change afterwards", async () => {
  await inTransaction(async (client) => {
    await addPeople(client);
    const real = await report(client, REAL, REAL, 3);
    assert.equal(real.judge_world_at_report, null);
    assert.equal((await report(client, JUDGE_1, JUDGE_1, null)).judge_world_at_report, 1);

    await client.query("SAVEPOINT s");
    await assert.rejects(client.query("UPDATE product_corrections SET judge_world_at_report = 1 WHERE id = $1", [real.id]), /fixed at insert/);
    await client.query("ROLLBACK TO SAVEPOINT s");
    // Other updates still go through, the reseed's reported_by = NULL among them.
    await client.query("UPDATE product_corrections SET status = 'rejected', reported_by = NULL WHERE id = $1", [real.id]);
  });
});

test("the world survives its accounts: a reseed deleting the judge leaves the report in the judge's world", async () => {
  await inTransaction(async (client) => {
    await addPeople(client);
    const { id } = await report(client, JUDGE_1, JUDGE_1);
    await client.query("UPDATE product_corrections SET reported_by = NULL, profile_owner_at_report = NULL WHERE id = $1", [id]);
    await client.query("DELETE FROM users WHERE id = $1", [JUDGE_1]);
    const { rows } = await client.query("SELECT judge_world_at_report FROM product_corrections WHERE id = $1", [id]);
    assert.equal(rows[0].judge_world_at_report, 1);
  });
});

// Signup's INSERT names its columns, and nothing else writes users but password changes. This keeps
// it that way: the only app code that puts a world on an account is the judge seed.
test("only the judge seed writes judge_world onto an account", async () => {
  const src = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
  const files = (await readdir(src, { recursive: true }))
    .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"))
    .map((f) => path.join(src, f));
  const writers: string[] = [];
  for (const file of files) {
    const text = await readFile(file, "utf8");
    const statements = text.match(/(INSERT INTO users|UPDATE users)[^`]*/g) ?? [];
    if (statements.some((s) => s.includes("judge_world"))) writers.push(path.relative(src, file));
  }
  assert.deepEqual(writers, [path.join("db", "seed", "judgeSeed.ts")]);
});
