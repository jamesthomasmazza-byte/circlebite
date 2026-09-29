import assert from "node:assert/strict";
import { rm } from "node:fs/promises";
import { after, before, test } from "node:test";

import { resolvePhotoPath } from "../corrections/photoStorage.js";
import { pool } from "../db/pool.js";
import { correctionsRouter } from "./corrections.js";

// No HTTP harness in this codebase (see scansLabel.test.ts) — this reaches into the router and
// invokes POST /scans/:scanId/corrections's main handler directly, past requireAuth and multer,
// with a fake req carrying what those two would have attached. Everything the handler does from
// there — access check, recordCorrection, the reporter's corrected view — runs for real against
// Postgres.

const REPORTER = "aaaaaaaa-0000-0000-0000-0000000000c1";
const PROFILE_ID = "bbbbbbbb-0000-0000-0000-0000000000c1";
const JPEG_MAGIC = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);

type Captured = { status: number; body: Record<string, unknown> };

function postCorrection(scanId: string, body: Record<string, unknown>): Promise<Captured> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const layer = (correctionsRouter as any).stack.find(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (l: any) => l.route?.path === "/scans/:scanId/corrections" && l.route.methods.post,
  );
  assert.ok(layer, "expected a registered POST /scans/:scanId/corrections route");
  // [0] requireAuth, [1] multer wrapper, [2] the main async handler.
  const handler = layer.route.stack.at(-1).handle;

  return new Promise((resolve, reject) => {
    let status = 200;
    const res = {
      status(code: number) {
        status = code;
        return res;
      },
      json(payload: Record<string, unknown>) {
        resolve({ status, body: payload });
      },
    };
    const req = { params: { scanId }, user: { id: REPORTER }, body, file: { buffer: JPEG_MAGIC } };
    handler(req, res, (err: unknown) => reject(err ?? new Error("handler called next() without responding")));
  });
}

async function makeScan(barcode: string, result: string, matched: object[]): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO scans (allergen_profile_id, barcode, result, matched_allergens, ingredients_text)
     VALUES ($1, $2, $3, $4, 'test ingredients') RETURNING id`,
    [PROFILE_ID, barcode, result, JSON.stringify(matched)],
  );
  return rows[0].id;
}

before(async () => {
  await pool.query(
    `INSERT INTO users (id, email, password_hash, display_name, age_attested_adult, age_attested_at)
     VALUES ($1, 'corr-route-test@example.com', 'x', 'A', true, now())`,
    [REPORTER],
  );
  await pool.query("INSERT INTO allergen_profiles (id, manager_id, label) VALUES ($1, $2, 'Test Profile')", [
    PROFILE_ID,
    REPORTER,
  ]);
});

after(async () => {
  const { rows } = await pool.query<{ photo_path: string }>(
    "DELETE FROM product_corrections WHERE scan_id IN (SELECT id FROM scans WHERE allergen_profile_id = $1) RETURNING photo_path",
    [PROFILE_ID],
  );
  await Promise.all(rows.map((r) => rm(resolvePhotoPath(r.photo_path), { force: true })));
  await pool.query("DELETE FROM users WHERE id = $1", [REPORTER]);
  await pool.end();
});

test("reporting an allergen missing returns the reporter's corrected view, not just the report status", async () => {
  // The 2026-09-29 live test: a Safe card, sesame reported missing, and the card kept saying Safe.
  const scanId = await makeScan("4000000000001", "safe", [
    { allergenName: "Sesame", severity: "severe", classification: "clear" },
  ]);

  const { status, body } = await postCorrection(scanId, { correctionType: "flag_missing", allergen: "Sesame" });

  assert.equal(status, 201);
  assert.equal(body.corroborated, true);
  const effective = body.effective as { result: string; matched_allergens: { allergenName: string; classification: string }[] };
  assert.equal(effective.result, "contains_allergen");
  assert.equal(effective.matched_allergens.find((m) => m.allergenName === "Sesame")?.classification, "contains");
  const corrections = body.corrections as { correctionType: string; status: string }[];
  assert.equal(corrections.length, 1);
  assert.equal(corrections[0].correctionType, "flag_missing");
  assert.equal(corrections[0].status, "corroborated");
  assert.deepEqual(body.community_reports, []);

  // The engine's own verdict on the row is untouched — the override is a view, never a rewrite.
  const { rows } = await pool.query<{ result: string }>("SELECT result FROM scans WHERE id = $1", [scanId]);
  assert.equal(rows[0].result, "safe");
});

test("a pending removal still changes the reporter's own card, and says it's pending", async () => {
  const scanId = await makeScan("4000000000002", "contains_allergen", [
    { allergenName: "Sesame", severity: "severe", classification: "contains" },
  ]);

  const { body } = await postCorrection(scanId, { correctionType: "flag_wrong", allergen: "Sesame" });

  assert.equal(body.corroborated, false);
  assert.equal((body.effective as { result: string }).result, "safe");
  assert.equal((body.corrections as { status: string }[])[0].status, "pending");
});
