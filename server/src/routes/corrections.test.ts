import assert from "node:assert/strict";
import { readdir, rm } from "node:fs/promises";
import path from "node:path";
import { after, before, test } from "node:test";

import { resolvePhotoPath } from "../corrections/photoStorage.js";
import { pool } from "../db/pool.js";
import { env } from "../env.js";
import { correctionsRouter } from "./corrections.js";

// No HTTP harness in this codebase (see scansLabel.test.ts) — this reaches into the router and
// invokes POST /scans/:scanId/corrections's main handler directly, past requireAuth and multer,
// with a fake req carrying what those two would have attached. Everything the handler does from
// there — access check, recordCorrection, the reporter's corrected view — runs for real against
// Postgres.

const REPORTER = "aaaaaaaa-0000-0000-0000-0000000000c1";
// The other two kinds of circle member on the same profile (REPORTER owns it).
const CO_MANAGER = "aaaaaaaa-0000-0000-0000-0000000000c2";
const FOLLOWER = "aaaaaaaa-0000-0000-0000-0000000000c3";
const PROFILE_ID = "bbbbbbbb-0000-0000-0000-0000000000c1";
const JPEG_MAGIC = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);

type Captured = { status: number; body: Record<string, unknown> };

function postCorrection(scanId: string, body: Record<string, unknown>, userId = REPORTER): Promise<Captured> {
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
    const req = { params: { scanId }, user: { id: userId }, body, file: { buffer: JPEG_MAGIC } };
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
     VALUES ($1, 'corr-route-test@example.com', 'x', 'A', true, now()),
            ($2, 'corr-route-comanager@example.com', 'x', 'Co-manager', true, now()),
            ($3, 'corr-route-follower@example.com', 'x', 'Follower', true, now())`,
    [REPORTER, CO_MANAGER, FOLLOWER],
  );
  await pool.query("INSERT INTO allergen_profiles (id, manager_id, label) VALUES ($1, $2, 'Test Profile')", [
    PROFILE_ID,
    REPORTER,
  ]);
  await pool.query("INSERT INTO profile_managers (allergen_profile_id, user_id, added_by) VALUES ($1, $2, $3)", [
    PROFILE_ID,
    CO_MANAGER,
    REPORTER,
  ]);
  await pool.query(
    `INSERT INTO follow_relationships (allergen_profile_id, follower_id, invited_by, token_hash, status, share_level)
     VALUES ($1, $2, $3, 'corr-route-test-follow-token', 'accepted', 'all')`,
    [PROFILE_ID, FOLLOWER, REPORTER],
  );
});

after(async () => {
  const { rows } = await pool.query<{ photo_path: string }>(
    "DELETE FROM product_corrections WHERE scan_id IN (SELECT id FROM scans WHERE allergen_profile_id = $1) RETURNING photo_path",
    [PROFILE_ID],
  );
  await Promise.all(rows.map((r) => rm(resolvePhotoPath(r.photo_path), { force: true })));
  await pool.query("DELETE FROM users WHERE id = ANY($1)", [[REPORTER, CO_MANAGER, FOLLOWER]]);
  await pool.end();
});

test("reporting an allergen missing returns the reporter's corrected view, not just the report status", async () => {
  // The 2026-09-29 live test: a Safe card, sesame reported missing, and the card kept saying Safe.
  const scanId = await makeScan("8000000000001", "safe", [
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
  const scanId = await makeScan("8000000000002", "contains_allergen", [
    { allergenName: "Sesame", severity: "severe", classification: "contains" },
  ]);

  const { body } = await postCorrection(scanId, { correctionType: "flag_wrong", allergen: "Sesame" });

  assert.equal(body.corroborated, false);
  assert.equal((body.effective as { result: string }).result, "safe");
  assert.equal((body.corrections as { status: string }[])[0].status, "pending");
});

test("reaches_other_families is true only for a corroborated addition with community corrections on", async () => {
  const matched = [{ allergenName: "Sesame", severity: "severe", classification: "clear" }];
  const previous = env.communityCorrections;
  try {
    env.communityCorrections = false;
    const off = await postCorrection(await makeScan("8000000000003", "safe", matched), { correctionType: "flag_missing", allergen: "Sesame" });
    assert.equal(off.body.corroborated, true);
    assert.equal(off.body.reaches_other_families, false, "switched off: the warning is only on the reporter's view");

    env.communityCorrections = true;
    const on = await postCorrection(await makeScan("8000000000004", "safe", matched), { correctionType: "flag_missing", allergen: "Sesame" });
    assert.equal(on.body.reaches_other_families, true);

    const removal = await postCorrection(await makeScan("8000000000005", "contains_allergen", matched), {
      correctionType: "flag_wrong",
      allergen: "Sesame",
    });
    assert.equal(removal.body.reaches_other_families, false, "removals never reach other families");
  } finally {
    env.communityCorrections = previous;
  }
});

test("a duplicate report is a 409 already_reported, and its photo doesn't stay on disk", async () => {
  // The 2026-10-01 production 500: the same sesame claim, reported again from a new scan.
  const matched = [{ allergenName: "Sesame", severity: "severe", classification: "clear" }];
  const dir = path.join(env.uploadDir, "corrections");
  await postCorrection(await makeScan("8000000000006", "safe", matched), { correctionType: "flag_missing", allergen: "Sesame" });
  const filesBefore = await readdir(dir);
  const secondScanId = await makeScan("8000000000006", "safe", matched);

  await assert.rejects(
    () => postCorrection(secondScanId, { correctionType: "flag_missing", allergen: "Sesame" }),
    (err: { status?: number; code?: string }) => err.status === 409 && err.code === "already_reported",
  );
  assert.deepEqual((await readdir(dir)).sort(), filesBefore.sort());
});

function getMyReports(scanId: string): Promise<{ status: number; body: unknown }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const layer = (correctionsRouter as any).stack.find(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (l: any) => l.route?.path === "/scans/:scanId/my-reports" && l.route.methods.get,
  );
  assert.ok(layer, "expected a registered GET /scans/:scanId/my-reports route");
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
    handler({ params: { scanId }, user: { id: REPORTER } }, res, (err: unknown) =>
      reject(err ?? new Error("handler called next() without responding")),
    );
  });
}

test("my-reports finds an earlier report on the same product from a different scan, without the admin's reason", async () => {
  const matched = [{ allergenName: "Sesame", severity: "severe", classification: "clear" }];
  const first = await postCorrection(await makeScan("8000000000007", "safe", matched), { correctionType: "flag_missing", allergen: "Sesame" });
  await pool.query(
    "UPDATE product_corrections SET status = 'rejected', rejected_at = now(), rejection_reason = 'admin-only text' WHERE id = $1",
    [first.body.id],
  );

  // A rescan is a new scan — the earlier report is only reachable by barcode.
  const { body } = await getMyReports(await makeScan("8000000000007", "safe", matched));
  const reports = body as Record<string, unknown>[];
  assert.equal(reports.length, 1);
  assert.equal(reports[0].status, "rejected");
  assert.equal(reports[0].allergen, "Sesame");
  assert.ok(reports[0].rejectedAt);
  assert.ok(!JSON.stringify(reports).includes("admin-only text"), "the rejection reason never reaches the reporter");
});

// Owner-only downgrades (docs/approvals/2026-10-01-yoest-mvp-statement.md): any circle member may
// report an allergen present; only the owner or a co-manager may report one isn't, or the wrong
// product. Prof. Yoest's babysitter is a follower.
test("a follower's removal is refused with 403, and leaves no row and no photo", async () => {
  const matched = [{ allergenName: "Peanut", severity: "severe", classification: "contains" }];
  const dir = path.join(env.uploadDir, "corrections");
  const filesBefore = await readdir(dir);

  for (const [correctionType, allergen] of [["flag_wrong", "Peanut"], ["wrong_product", null]] as const) {
    const scanId = await makeScan("8000000000008", "contains_allergen", matched);
    await assert.rejects(
      () => postCorrection(scanId, { correctionType, allergen }, FOLLOWER),
      (err: { status?: number; code?: string }) => err.status === 403 && err.code === "removal_requires_manager",
      correctionType,
    );
  }

  const { rows } = await pool.query("SELECT 1 FROM product_corrections WHERE reported_by = $1", [FOLLOWER]);
  assert.equal(rows.length, 0);
  assert.deepEqual((await readdir(dir)).sort(), filesBefore.sort());
});

test("the owner's and a co-manager's removals both go through", async () => {
  const matched = [{ allergenName: "Peanut", severity: "severe", classification: "contains" }];
  for (const userId of [REPORTER, CO_MANAGER]) {
    const { status } = await postCorrection(
      await makeScan("8000000000009", "contains_allergen", matched),
      { correctionType: "flag_wrong", allergen: "Peanut" },
      userId,
    );
    assert.equal(status, 201, userId === REPORTER ? "owner" : "co-manager");
  }
});

test("a follower can still report an allergen present", async () => {
  const { status, body } = await postCorrection(
    await makeScan("8000000000010", "safe", [{ allergenName: "Peanut", severity: "severe", classification: "clear" }]),
    { correctionType: "flag_missing", allergen: "Peanut" },
    FOLLOWER,
  );
  assert.equal(status, 201);
  assert.equal(body.corroborated, true);
});
