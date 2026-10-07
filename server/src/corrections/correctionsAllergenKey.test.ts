import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { after, test } from "node:test";

import { pool } from "../db/pool.js";
import { allergenKey } from "../matcher/match.js";
import { SYNONYM_CLUSTERS } from "../matcher/synonyms.js";

// Migration 0043's backfill is a SQL copy of allergenKey(). This runs the migration file itself
// against a session-private TEMP copy of product_corrections — a temp table shadows the real one by
// name for this connection only, so the real table is never altered or locked (the ea106fa rule: no
// test takes a table-wide lock on a shared table). Real rows are copied in as they are, plus a row
// for every synonym alias and the free-text shapes allergenKey handles, across every status.

const MIGRATION = path.join(path.dirname(fileURLToPath(import.meta.url)), "../db/migrations/0043_product_corrections_add_allergen_key.sql");

after(async () => {
  await pool.end();
});

test("migration 0043 backfills allergenKey() for every row, and leaves every status and every other column untouched", async () => {
  const client = await pool.connect();
  try {
    await client.query("CREATE TEMP TABLE product_corrections (LIKE public.product_corrections INCLUDING DEFAULTS)");
    await client.query("INSERT INTO product_corrections SELECT * FROM public.product_corrections");
    await client.query("ALTER TABLE product_corrections DROP COLUMN allergen_key");

    const spellings = [
      ...SYNONYM_CLUSTERS.flatMap((c) => c.aliases.flatMap((a) => [a, a.toUpperCase(), `  ${a[0].toUpperCase()}${a.slice(1)} `])),
      "Kiwi",
      "Kiwis",
      "kiwis ",
      "s",
      "Ss",
      "Sesames",
      "\tMustard\n",
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

    const read = async () =>
      (await client.query<{ id: string; allergen: string | null; allergen_key?: string | null; rest: unknown }>(
        "SELECT id, allergen, allergen_key, to_jsonb(t) - 'allergen_key' AS rest FROM product_corrections t ORDER BY id",
      )).rows;
    const before = (await client.query<{ id: string; rest: unknown }>("SELECT id, to_jsonb(t) AS rest FROM product_corrections t ORDER BY id")).rows;
    assert.ok(before.length > spellings.length);

    await client.query(await readFile(MIGRATION, "utf8"));

    const afterRows = await read();
    assert.deepEqual(
      afterRows.map((r) => ({ id: r.id, rest: r.rest })),
      before,
      "status and every other column exactly as before — nothing re-evaluated",
    );
    for (const row of afterRows) {
      assert.equal(row.allergen_key, row.allergen === null ? null : allergenKey(row.allergen), JSON.stringify(row.allergen));
    }
  } finally {
    await client.query("DROP TABLE IF EXISTS pg_temp.product_corrections");
    client.release();
  }
});
