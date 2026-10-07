import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { after, test } from "node:test";

import type { PoolClient } from "pg";

import { pool } from "../db/pool.js";
import { allergenFamilyKey, allergenFoldKey } from "../matcher/match.js";
import { SYNONYM_CLUSTERS } from "../matcher/synonyms.js";

// Migrations 0043 and 0044, run from their own files against a session-private TEMP copy of
// product_corrections — a temp table shadows the real one by name for this connection only, so the
// real table is never altered or locked (the ea106fa rule: no test takes a table-wide lock on a
// shared table). Each test runs in a transaction it rolls back, which also undoes 0043's
// CREATE OR REPLACE of its backfill function.

const MIGRATIONS = path.join(path.dirname(fileURLToPath(import.meta.url)), "../db/migrations");
const migration = (file: string) => readFile(path.join(MIGRATIONS, file), "utf8");

after(async () => {
  await pool.end();
});

async function inTempCopy(body: (client: PoolClient) => Promise<void>) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // LIKE without INCLUDING CONSTRAINTS: no CHECKs, so 0044 can be run against it fresh.
    await client.query("CREATE TEMP TABLE product_corrections (LIKE public.product_corrections INCLUDING DEFAULTS) ON COMMIT DROP");
    await client.query("INSERT INTO product_corrections SELECT * FROM public.product_corrections");
    await body(client);
  } finally {
    await client.query("ROLLBACK");
    client.release();
  }
}

function insert(client: PoolClient, allergen: string | null, status: string, keys: [string | null, string | null] = [null, null]) {
  return client.query(
    `INSERT INTO product_corrections
       (barcode, correction_type, direction, allergen, target, verdict_at_report, photo_path, status, allergen_fold_key, allergen_family_key)
     VALUES ('4300000000001', $1, $2, $3, 'off_data', 'safe', 'x.jpg', $4, $5, $6) RETURNING id`,
    [allergen === null ? "wrong_product" : "flag_missing", allergen === null ? "remove_caution" : "add_caution", allergen, status, ...keys],
  );
}

test("0043 backfills both keys to exactly what allergenFoldKey/allergenFamilyKey return, and changes nothing else", async () => {
  await inTempCopy(async (client) => {
    await client.query("ALTER TABLE product_corrections DROP COLUMN allergen_fold_key, DROP COLUMN allergen_family_key");

    const spellings = [
      ...SYNONYM_CLUSTERS.flatMap((c) => c.aliases.flatMap((a) => [a, a.toUpperCase(), `  ${a[0].toUpperCase()}${a.slice(1)} `])),
      "Kiwi",
      "Kiwis",
      "kiwis ",
      "s",
      "Ss",
      "Sesames",
      "\tMustard\n",
      "cluster:dairy",
    ];
    const statuses = ["pending", "corroborated", "rejected"];
    for (const [i, allergen] of spellings.entries()) {
      await client.query(
        `INSERT INTO product_corrections (barcode, correction_type, direction, allergen, target, verdict_at_report, photo_path, status)
         VALUES ('4300000000001', 'flag_missing', 'add_caution', $1, 'off_data', 'safe', 'x.jpg', $2)`,
        [allergen, statuses[i % statuses.length]],
      );
    }
    await client.query(
      `INSERT INTO product_corrections (barcode, correction_type, direction, allergen, target, verdict_at_report, photo_path, status)
       VALUES ('4300000000001', 'wrong_product', 'remove_caution', NULL, 'off_data', 'safe', 'x.jpg', 'corroborated')`,
    );
    const before = (await client.query("SELECT id, to_jsonb(t) AS rest FROM product_corrections t ORDER BY id")).rows;
    assert.ok(before.length > spellings.length);

    await client.query(await migration("0043_product_corrections_add_allergen_keys.sql"));

    const afterRows = (
      await client.query<{ id: string; allergen: string | null; fold: string | null; family: string | null; rest: unknown }>(
        `SELECT id, allergen, allergen_fold_key AS fold, allergen_family_key AS family,
                to_jsonb(t) - 'allergen_fold_key' - 'allergen_family_key' AS rest
         FROM product_corrections t ORDER BY id`,
      )
    ).rows;
    assert.deepEqual(
      afterRows.map((r) => ({ id: r.id, rest: r.rest })),
      before,
      "status and every other column exactly as before — nothing re-evaluated",
    );
    for (const row of afterRows) {
      const label = JSON.stringify(row.allergen);
      assert.equal(row.fold, row.allergen === null ? null : allergenFoldKey(row.allergen), `fold ${label}`);
      assert.equal(row.family, row.allergen === null ? null : allergenFamilyKey(row.allergen), `family ${label}`);
    }
  });
});

test("0043's kept backfill function fills only missing keys, never rewrites a keyed row", async () => {
  await inTempCopy(async (client) => {
    const keyed = (await insert(client, "Milk", "corroborated", ["kept-fold", "kept-family"])).rows[0].id;
    const unkeyed = (await insert(client, "Whey", "pending")).rows[0].id;

    await client.query("SELECT product_corrections_backfill_allergen_keys()");

    const read = async (id: string) =>
      (await client.query("SELECT allergen_fold_key, allergen_family_key, status FROM product_corrections WHERE id = $1", [id])).rows[0];
    assert.deepEqual(await read(keyed), { allergen_fold_key: "kept-fold", allergen_family_key: "kept-family", status: "corroborated" });
    assert.deepEqual(await read(unkeyed), { allergen_fold_key: "whey", allergen_family_key: "cluster:dairy", status: "pending" });
  });
});

test("0044 fills the keys a deploy leaves missing, then requires them", async () => {
  await inTempCopy(async (client) => {
    // Written by the previous release between 0043 migrating and the symlink swap.
    const unkeyed = (await insert(client, "Peanut", "pending")).rows[0].id;

    await client.query(await migration("0044_product_corrections_require_allergen_keys.sql"));
    const { rows } = await client.query("SELECT allergen_fold_key, allergen_family_key, status FROM product_corrections WHERE id = $1", [unkeyed]);
    assert.deepEqual(rows[0], { allergen_fold_key: "peanut", allergen_family_key: "cluster:peanut", status: "pending" });

    await client.query("SAVEPOINT after_0044");
    await assert.rejects(insert(client, "Sesame", "pending"), /product_corrections_allergen_keys_present/);
    await client.query("ROLLBACK TO SAVEPOINT after_0044");
    await insert(client, null, "pending"); // wrong_product: no allergen, no keys
  });
});

test("0044 refuses, loudly, if a row still has no key after the backfill — and adds no constraint", async () => {
  await inTempCopy(async (client) => {
    await insert(client, "Peanut", "pending");
    // A backfill that fills nothing — the unexpected case 0044 exists to stop on. Replaced inside
    // this rolled-back transaction only.
    await client.query(
      "CREATE OR REPLACE FUNCTION product_corrections_backfill_allergen_keys() RETURNS integer LANGUAGE sql AS 'SELECT 0'",
    );

    await assert.rejects(client.query(await migration("0044_product_corrections_require_allergen_keys.sql")), (err: { message: string; hint?: string }) => {
      assert.match(err.message, /1 product_corrections row\(s\) name an allergen but still have no allergen key after the backfill/);
      assert.match(err.hint ?? "", /left them unfilled/);
      return true;
    });
  });
});
