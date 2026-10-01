import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import { pool } from "../db/pool.js";
import { directionForCorrectionType, recordCorrection } from "./recordCorrection.js";

// Real Postgres, not mocked — this function is mostly transaction/corroboration-counting logic,
// which a fake DB layer can't meaningfully exercise. Same discipline as spendGuard's verification:
// real inserts, real cleanup, nothing left behind.

const USER_A = "aaaaaaaa-0000-0000-0000-000000000001";
const USER_B = "aaaaaaaa-0000-0000-0000-000000000002";
const USER_C = "aaaaaaaa-0000-0000-0000-000000000003";
const PROFILE_ID = "bbbbbbbb-0000-0000-0000-000000000001";

async function makeScan(
  barcode: string | null,
  result: string,
  matchedAllergens: { allergenName: string; severity: string; classification: string; aiEscalated?: boolean }[],
  ingredientsText = "test ingredients",
): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO scans (allergen_profile_id, barcode, result, matched_allergens, ingredients_text)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [PROFILE_ID, barcode, result, JSON.stringify(matchedAllergens), ingredientsText],
  );
  return rows[0].id;
}

async function makeVerdictExplanation(scanId: string, model = "claude-haiku-4-5-20251001", promptVersion = "path-b-v1") {
  await pool.query(
    `INSERT INTO verdict_explanations (scan_id, model, prompt_version, verdict, confidence)
     VALUES ($1, $2, $3, 'contains_allergen', 'medium')`,
    [scanId, model, promptVersion],
  );
}

// matched_product_identity is what combineLabelScan actually sets on a real combine attempt
// (docs/verdict-engine.md Path D) — inserted directly here rather than going through the full
// combine flow, since this file is only exercising recordCorrection's own gating logic against it.
async function makeLabelExtraction(scanId: string, matchedProductIdentity: boolean | null) {
  await pool.query(
    `INSERT INTO label_extractions (scan_id, model, prompt_version, matched_product_identity)
     VALUES ($1, 'claude-haiku-4-5-20251001', 'path-d-v1', $2)`,
    [scanId, matchedProductIdentity],
  );
}

before(async () => {
  await pool.query(
    `INSERT INTO users (id, email, password_hash, display_name, age_attested_adult, age_attested_at) VALUES
       ($1, 'corr-test-a@example.com', 'x', 'A', true, now()),
       ($2, 'corr-test-b@example.com', 'x', 'B', true, now()),
       ($3, 'corr-test-c@example.com', 'x', 'C', true, now())`,
    [USER_A, USER_B, USER_C],
  );
  await pool.query("INSERT INTO allergen_profiles (id, manager_id, label) VALUES ($1, $2, 'Test Profile')", [
    PROFILE_ID,
    USER_A,
  ]);
});

after(async () => {
  // product_corrections.scan_id is ON DELETE SET NULL, not CASCADE (migration 0020) — corrections
  // no longer disappear when their scan does, so cleaning up the scans first (via the users
  // cascade) would leave every correction this file created behind, orphaned, breaking the fixed
  // barcodes on the next run. Delete them explicitly, before the cascade removes the scans they key
  // off of.
  await pool.query("DELETE FROM product_corrections WHERE scan_id IN (SELECT id FROM scans WHERE allergen_profile_id = $1)", [
    PROFILE_ID,
  ]);
  await pool.query("DELETE FROM users WHERE id = ANY($1)", [[USER_A, USER_B, USER_C]]);
  await pool.end();
});

test("directionForCorrectionType: only flag_missing adds a caution, the rest remove one", () => {
  assert.equal(directionForCorrectionType("flag_missing"), "add_caution");
  assert.equal(directionForCorrectionType("flag_wrong"), "remove_caution");
  assert.equal(directionForCorrectionType("wrong_product"), "remove_caution");
});

test("rejects a wrong_product correction that specifies an allergen", async () => {
  const scanId = await makeScan("1000000000001", "safe", []);
  await assert.rejects(() =>
    recordCorrection({
      scanId,
      reportedBy: USER_A,
      correctionType: "wrong_product",
      allergen: "Milk",
      note: null,
      photoPath: "/fake.jpg",
      origin: "user_initiated",
    }),
  );
});

test("rejects a flag_wrong correction with no allergen", async () => {
  const scanId = await makeScan("1000000000002", "contains_allergen", []);
  await assert.rejects(() =>
    recordCorrection({ scanId, reportedBy: USER_A, correctionType: "flag_wrong", allergen: null, note: null, photoPath: "/fake.jpg", origin: "user_initiated" }),
  );
});

test("target is off_data for a deterministic-sourced allergen, with no verdict_explanation_id", async () => {
  const scanId = await makeScan("1000000000003", "contains_allergen", [
    { allergenName: "Milk", severity: "severe", classification: "contains", aiEscalated: false },
  ]);
  await recordCorrection({ scanId, reportedBy: USER_A, correctionType: "flag_wrong", allergen: "Milk", note: null, photoPath: "/fake.jpg", origin: "user_initiated" });

  const { rows } = await pool.query("SELECT target, verdict_explanation_id, model_at_report FROM product_corrections WHERE scan_id = $1", [scanId]);
  assert.equal(rows[0].target, "off_data");
  assert.equal(rows[0].verdict_explanation_id, null);
  assert.equal(rows[0].model_at_report, null);
});

test("target is ai_verdict for an AI-escalated allergen, with the scan's verdict_explanation linked", async () => {
  const scanId = await makeScan("1000000000004", "contains_allergen", [
    { allergenName: "Milk", severity: "severe", classification: "contains", aiEscalated: true },
  ]);
  await makeVerdictExplanation(scanId, "claude-haiku-4-5-20251001", "path-b-v1");

  await recordCorrection({ scanId, reportedBy: USER_A, correctionType: "flag_wrong", allergen: "Milk", note: null, photoPath: "/fake.jpg", origin: "user_initiated" });

  const { rows } = await pool.query(
    "SELECT target, verdict_explanation_id, model_at_report, prompt_version_at_report FROM product_corrections WHERE scan_id = $1",
    [scanId],
  );
  assert.equal(rows[0].target, "ai_verdict");
  assert.ok(rows[0].verdict_explanation_id);
  assert.equal(rows[0].model_at_report, "claude-haiku-4-5-20251001");
  assert.equal(rows[0].prompt_version_at_report, "path-b-v1");
});

test("denormalizes verdict and source text at report time, per the N17 self-sufficiency precedent", async () => {
  const scanId = await makeScan(
    "1000000000005",
    "contains_allergen",
    [{ allergenName: "Milk", severity: "severe", classification: "contains", aiEscalated: false }],
    "water, sugar, sodium caseinate",
  );
  await recordCorrection({ scanId, reportedBy: USER_A, correctionType: "flag_wrong", allergen: "Milk", note: "not actually milk", photoPath: "/fake.jpg", origin: "user_initiated" });

  const { rows } = await pool.query("SELECT verdict_at_report, source_text_at_report, note FROM product_corrections WHERE scan_id = $1", [scanId]);
  assert.equal(rows[0].verdict_at_report, "contains_allergen");
  assert.equal(rows[0].source_text_at_report, "water, sugar, sodium caseinate");
  assert.equal(rows[0].note, "not actually milk");
});

test("add_caution corroborates on the first report — threshold of 1", async () => {
  const scanId = await makeScan("1000000000006", "safe", [{ allergenName: "Egg", severity: "moderate", classification: "clear" }]);
  const result = await recordCorrection({ scanId, reportedBy: USER_A, correctionType: "flag_missing", allergen: "Egg", note: null, photoPath: "/fake.jpg", origin: "user_initiated" });
  assert.equal(result.corroborated, true);
  assert.equal(result.status, "corroborated");
});

test("remove_caution stays pending until the third distinct reporter — threshold of 3", async () => {
  const barcode = "1000000000007";
  const scan1 = await makeScan(barcode, "contains_allergen", [{ allergenName: "Soy", severity: "mild", classification: "contains" }]);
  const scan2 = await makeScan(barcode, "contains_allergen", [{ allergenName: "Soy", severity: "mild", classification: "contains" }]);
  const scan3 = await makeScan(barcode, "contains_allergen", [{ allergenName: "Soy", severity: "mild", classification: "contains" }]);

  const first = await recordCorrection({ scanId: scan1, reportedBy: USER_A, correctionType: "flag_wrong", allergen: "Soy", note: null, photoPath: "/fake.jpg", origin: "user_initiated" });
  assert.equal(first.corroborated, false);

  const second = await recordCorrection({ scanId: scan2, reportedBy: USER_B, correctionType: "flag_wrong", allergen: "Soy", note: null, photoPath: "/fake.jpg", origin: "user_initiated" });
  assert.equal(second.corroborated, false);

  const third = await recordCorrection({ scanId: scan3, reportedBy: USER_C, correctionType: "flag_wrong", allergen: "Soy", note: null, photoPath: "/fake.jpg", origin: "user_initiated" });
  assert.equal(third.corroborated, true);

  // All three, including the earlier pending ones, flip to corroborated together.
  const { rows } = await pool.query("SELECT status FROM product_corrections WHERE barcode = $1 AND allergen = 'Soy'", [barcode]);
  assert.equal(rows.length, 3);
  assert.ok(rows.every((r) => r.status === "corroborated"));
});

test("rejected reports don't count toward the remove_caution threshold", async () => {
  const barcode = "1000000000015";
  const soy = [{ allergenName: "Soy", severity: "mild", classification: "contains" }];

  const first = await recordCorrection({ scanId: await makeScan(barcode, "contains_allergen", soy), reportedBy: USER_A, correctionType: "flag_wrong", allergen: "Soy", note: null, photoPath: "/fake.jpg", origin: "user_initiated" });
  const second = await recordCorrection({ scanId: await makeScan(barcode, "contains_allergen", soy), reportedBy: USER_B, correctionType: "flag_wrong", allergen: "Soy", note: null, photoPath: "/fake.jpg", origin: "user_initiated" });
  await pool.query("UPDATE product_corrections SET status = 'rejected' WHERE id = ANY($1)", [[first.id, second.id]]);

  // Three distinct reporters on the claim, but two were rejected — only one live report.
  const third = await recordCorrection({ scanId: await makeScan(barcode, "contains_allergen", soy), reportedBy: USER_C, correctionType: "flag_wrong", allergen: "Soy", note: null, photoPath: "/fake.jpg", origin: "user_initiated" });
  assert.equal(third.corroborated, false);
  assert.equal(third.status, "pending");
});

test("the same reporter filing the same claim again gets a 409 already_reported, and no second row", async () => {
  const barcode = "1000000000016";
  const sesame = [{ allergenName: "Sesame", severity: "severe", classification: "clear" }];
  const input = { reportedBy: USER_A, correctionType: "flag_missing" as const, allergen: "Sesame", note: null, photoPath: "/fake.jpg", origin: "user_initiated" as const };

  await recordCorrection({ scanId: await makeScan(barcode, "safe", sesame), ...input });
  // A second scan of the same barcode — the duplicate is per product, not per scan.
  await assert.rejects(
    async () => recordCorrection({ scanId: await makeScan(barcode, "safe", sesame), ...input }),
    (err: { status?: number; code?: string }) => err.status === 409 && err.code === "already_reported",
  );

  const { rows } = await pool.query("SELECT 1 FROM product_corrections WHERE barcode = $1", [barcode]);
  assert.equal(rows.length, 1);
});

test("a duplicate wrong_product report is a 409 too — the second anti-inflation index", async () => {
  const barcode = "1000000000017";
  const input = { reportedBy: USER_A, correctionType: "wrong_product" as const, allergen: null, note: null, photoPath: "/fake.jpg", origin: "user_initiated" as const };

  await recordCorrection({ scanId: await makeScan(barcode, "contains_allergen", []), ...input });
  await assert.rejects(
    async () => recordCorrection({ scanId: await makeScan(barcode, "contains_allergen", []), ...input }),
    (err: { status?: number; code?: string }) => err.status === 409 && err.code === "already_reported",
  );
});

test("wrong_product uses its own corroboration bucket, keyed by barcode alone (allergen is null)", async () => {
  const barcode = "1000000000008";
  const scan1 = await makeScan(barcode, "contains_allergen", []);
  const scan2 = await makeScan(barcode, "contains_allergen", []);
  const scan3 = await makeScan(barcode, "contains_allergen", []);

  await recordCorrection({ scanId: scan1, reportedBy: USER_A, correctionType: "wrong_product", allergen: null, note: null, photoPath: "/fake.jpg", origin: "user_initiated" });
  await recordCorrection({ scanId: scan2, reportedBy: USER_B, correctionType: "wrong_product", allergen: null, note: null, photoPath: "/fake.jpg", origin: "user_initiated" });
  const third = await recordCorrection({ scanId: scan3, reportedBy: USER_C, correctionType: "wrong_product", allergen: null, note: null, photoPath: "/fake.jpg", origin: "user_initiated" });

  assert.equal(third.corroborated, true);
});

test("a remove_caution bucket never corroborates while a corroborated add_caution exists for the same allergen — the warning survives", async () => {
  const barcode = "1000000000009";

  // First, corroborate an add_caution for Peanut (threshold 1).
  const addScan = await makeScan(barcode, "safe", [{ allergenName: "Peanut", severity: "severe", classification: "clear" }]);
  await recordCorrection({ scanId: addScan, reportedBy: USER_A, correctionType: "flag_missing", allergen: "Peanut", note: null, photoPath: "/fake.jpg", origin: "user_initiated" });

  // Now try to remove it with 3 reporters — should never corroborate, despite hitting the count.
  const removeScan1 = await makeScan(barcode, "contains_allergen", [{ allergenName: "Peanut", severity: "severe", classification: "contains" }]);
  const removeScan2 = await makeScan(barcode, "contains_allergen", [{ allergenName: "Peanut", severity: "severe", classification: "contains" }]);
  const removeScan3 = await makeScan(barcode, "contains_allergen", [{ allergenName: "Peanut", severity: "severe", classification: "contains" }]);

  await recordCorrection({ scanId: removeScan1, reportedBy: USER_A, correctionType: "flag_wrong", allergen: "Peanut", note: null, photoPath: "/fake.jpg", origin: "user_initiated" });
  await recordCorrection({ scanId: removeScan2, reportedBy: USER_B, correctionType: "flag_wrong", allergen: "Peanut", note: null, photoPath: "/fake.jpg", origin: "user_initiated" });
  const third = await recordCorrection({ scanId: removeScan3, reportedBy: USER_C, correctionType: "flag_wrong", allergen: "Peanut", note: null, photoPath: "/fake.jpg", origin: "user_initiated" });

  assert.equal(third.corroborated, false);
  const { rows } = await pool.query(
    "SELECT status FROM product_corrections WHERE barcode = $1 AND allergen = 'Peanut' AND direction = 'remove_caution'",
    [barcode],
  );
  assert.ok(rows.every((r) => r.status === "pending"));
});

test("a barcode-less (Path C) scan's correction never corroborates, even past the add_caution threshold of 1", async () => {
  const scanId = await makeScan(null, "safe", [{ allergenName: "Egg", severity: "moderate", classification: "clear" }]);
  const result = await recordCorrection({ scanId, reportedBy: USER_A, correctionType: "flag_missing", allergen: "Egg", note: null, photoPath: "/fake.jpg", origin: "user_initiated" });

  // add_caution normally corroborates on the very first report (see the threshold-of-1 test
  // above) — proving it does NOT here is the actual assertion that the corroboration step is
  // skipped for a null barcode, not just coincidentally under some other threshold.
  assert.equal(result.corroborated, false);
  assert.equal(result.status, "pending");

  const { rows } = await pool.query("SELECT barcode, status FROM product_corrections WHERE id = $1", [result.id]);
  assert.equal(rows[0].barcode, null);
  assert.equal(rows[0].status, "pending");
});

test("two different barcode-less corrections on the same allergen/direction don't corroborate against each other", async () => {
  // The bug this guards against: without the barcode !== null check, count(DISTINCT reported_by)
  // WHERE barcode = NULL would return 0 rows (NULL never equals NULL in SQL), which happens to be
  // safe by accident — but reviewQueue.ts's own bucketing (JSON.stringify([barcode, ...])) would
  // still merge these two unrelated scans' reports into one claim if it used the naive key. This
  // test only proves recordCorrection's own side: two independent users' null-barcode reports on
  // "Peanut"/add_caution must not corroborate together the way two real-barcode reports would.
  const scanA = await makeScan(null, "safe", [{ allergenName: "Peanut", severity: "severe", classification: "clear" }]);
  const scanB = await makeScan(null, "safe", [{ allergenName: "Peanut", severity: "severe", classification: "clear" }]);

  const first = await recordCorrection({ scanId: scanA, reportedBy: USER_A, correctionType: "flag_missing", allergen: "Peanut", note: null, photoPath: "/fake.jpg", origin: "user_initiated" });
  const second = await recordCorrection({ scanId: scanB, reportedBy: USER_B, correctionType: "flag_missing", allergen: "Peanut", note: null, photoPath: "/fake.jpg", origin: "user_initiated" });

  assert.equal(first.corroborated, false);
  assert.equal(second.corroborated, false);
});

test("a different allergen on the same barcode gets its own independent corroboration count", async () => {
  const barcode = "1000000000010";
  const milkScan = await makeScan(barcode, "contains_allergen", [{ allergenName: "Milk", severity: "severe", classification: "contains" }]);
  const soyScan = await makeScan(barcode, "contains_allergen", [{ allergenName: "Soy", severity: "mild", classification: "contains" }]);

  const milkResult = await recordCorrection({ scanId: milkScan, reportedBy: USER_A, correctionType: "flag_wrong", allergen: "Milk", note: null, photoPath: "/fake.jpg", origin: "user_initiated" });
  const soyResult = await recordCorrection({ scanId: soyScan, reportedBy: USER_A, correctionType: "flag_wrong", allergen: "Soy", note: null, photoPath: "/fake.jpg", origin: "user_initiated" });

  // One reporter each, threshold 3 for remove_caution — neither should corroborate yet.
  assert.equal(milkResult.corroborated, false);
  assert.equal(soyResult.corroborated, false);
});

test("a correction against a scan whose label evidence mismatched never corroborates, even past the add_caution threshold of 1", async () => {
  const barcode = "1000000000012";
  const scanId = await makeScan(barcode, "safe", [{ allergenName: "Egg", severity: "moderate", classification: "clear" }]);
  await makeLabelExtraction(scanId, false);

  const result = await recordCorrection({ scanId, reportedBy: USER_A, correctionType: "flag_missing", allergen: "Egg", note: null, photoPath: "/fake.jpg", origin: "user_initiated" });

  // Same proof shape as the barcode-less test above: add_caution normally corroborates on the very
  // first report, so it not doing so here is the actual assertion that the mismatch gate fired.
  assert.equal(result.corroborated, false);
  assert.equal(result.status, "pending");

  const { rows } = await pool.query("SELECT identity_mismatch_at_report, status FROM product_corrections WHERE id = $1", [result.id]);
  assert.equal(rows[0].identity_mismatch_at_report, true);
  assert.equal(rows[0].status, "pending");
});

test("a correction against an ordinary scan (no label mismatch) records identity_mismatch_at_report as false and corroborates normally", async () => {
  const barcode = "1000000000013";
  const scanId = await makeScan(barcode, "safe", [{ allergenName: "Egg", severity: "moderate", classification: "clear" }]);
  await makeLabelExtraction(scanId, true); // matched, not mismatched

  const result = await recordCorrection({ scanId, reportedBy: USER_A, correctionType: "flag_missing", allergen: "Egg", note: null, photoPath: "/fake.jpg", origin: "user_initiated" });

  assert.equal(result.corroborated, true);
  const { rows } = await pool.query("SELECT identity_mismatch_at_report FROM product_corrections WHERE id = $1", [result.id]);
  assert.equal(rows[0].identity_mismatch_at_report, false);
});

test("a scan with two label_extractions rows (an old mismatched attempt, then a later matched retry) still gates — over-gating is the safe direction", async () => {
  // Reproduces a shape only possible from before the mismatch block was removed: a blocked
  // mismatch attempt left one row, then a retry against the same scan succeeded and left a second,
  // matched row. recordCorrection checks for ANY mismatched row on the scan, not just the latest —
  // skipping corroboration here even though the scan's current state matched is the deliberately
  // conservative choice.
  const barcode = "1000000000014";
  const scanId = await makeScan(barcode, "safe", [{ allergenName: "Egg", severity: "moderate", classification: "clear" }]);
  await makeLabelExtraction(scanId, false);
  await makeLabelExtraction(scanId, true);

  const result = await recordCorrection({ scanId, reportedBy: USER_A, correctionType: "flag_missing", allergen: "Egg", note: null, photoPath: "/fake.jpg", origin: "user_initiated" });

  assert.equal(result.corroborated, false);
  const { rows } = await pool.query("SELECT identity_mismatch_at_report FROM product_corrections WHERE id = $1", [result.id]);
  assert.equal(rows[0].identity_mismatch_at_report, true);
});

test("origin is persisted as given, never inferred or defaulted by this function", async () => {
  const scanId = await makeScan("1000000000011", "contains_allergen", [{ allergenName: "Milk", severity: "severe", classification: "contains" }]);
  const result = await recordCorrection({
    scanId,
    reportedBy: USER_A,
    correctionType: "flag_wrong",
    allergen: "Milk",
    note: null,
    photoPath: "/fake.jpg",
    origin: "disagreement_prompt",
  });

  const { rows } = await pool.query<{ origin: string }>("SELECT origin FROM product_corrections WHERE id = $1", [result.id]);
  assert.equal(rows[0].origin, "disagreement_prompt");
});

// Synthetic reproduction of the 2026-10-01 lockout — the same row shape as production's (a rejected
// add_caution for sesame on 5690516025007) with a seeded reporter, never a copy of production data.
test("a rejected reporter can re-file the claim, and the re-file is held for review rather than corroborating", async () => {
  const barcode = "5690516025007";
  const sesame = [{ allergenName: "sesame", severity: "severe", classification: "clear" }];
  const report = { reportedBy: USER_A, correctionType: "flag_missing" as const, allergen: "sesame", note: null, photoPath: "/fake.jpg", origin: "user_initiated" as const };

  const original = await recordCorrection({ scanId: await makeScan(barcode, "safe", sesame), ...report });
  assert.equal(original.corroborated, true, "an addition corroborates on its first report");
  await pool.query("UPDATE product_corrections SET status = 'rejected', rejected_at = now() WHERE id = $1", [original.id]);

  const refile = await recordCorrection({ scanId: await makeScan(barcode, "safe", sesame), ...report });
  assert.equal(refile.corroborated, false, "a re-file must not undo the admin's rejection by itself");
  assert.equal(refile.status, "pending");
  const { rows } = await pool.query<{ refiles_rejected_id: string | null }>(
    "SELECT refiles_rejected_id FROM product_corrections WHERE id = $1",
    [refile.id],
  );
  assert.equal(rows[0].refiles_rejected_id, original.id);

  // One live report per person per claim still holds — re-filing the re-file is a duplicate.
  await assert.rejects(
    async () => recordCorrection({ scanId: await makeScan(barcode, "safe", sesame), ...report }),
    (err: { status?: number; code?: string }) => err.status === 409 && err.code === "already_reported",
  );

  // An independent reporter still corroborates on their own (threshold 1, unchanged), and the held
  // re-file goes along with its claim.
  const independent = await recordCorrection({ scanId: await makeScan(barcode, "safe", sesame), ...report, reportedBy: USER_B });
  assert.equal(independent.corroborated, true);
  const { rows: after } = await pool.query<{ status: string }>("SELECT status FROM product_corrections WHERE id = $1", [refile.id]);
  assert.equal(after[0].status, "corroborated");
});

test("re-files don't count toward the remove_caution threshold", async () => {
  const barcode = "1000000000018";
  const soy = [{ allergenName: "Soy", severity: "mild", classification: "contains" }];
  const report = (reportedBy: string) => ({ reportedBy, correctionType: "flag_wrong" as const, allergen: "Soy", note: null, photoPath: "/fake.jpg", origin: "user_initiated" as const });

  const a = await recordCorrection({ scanId: await makeScan(barcode, "contains_allergen", soy), ...report(USER_A) });
  await pool.query("UPDATE product_corrections SET status = 'rejected', rejected_at = now() WHERE id = $1", [a.id]);
  await recordCorrection({ scanId: await makeScan(barcode, "contains_allergen", soy), ...report(USER_A) });
  await recordCorrection({ scanId: await makeScan(barcode, "contains_allergen", soy), ...report(USER_B) });
  // Three distinct people with a live report would be the threshold — but one of them is a re-file.
  const third = await recordCorrection({ scanId: await makeScan(barcode, "contains_allergen", soy), ...report(USER_C) });
  assert.equal(third.corroborated, false);
});

test("reports against a mismatched label never count toward someone else's threshold, and aren't flipped with the claim", async () => {
  const barcode = "1000000000019";
  const soy = [{ allergenName: "Soy", severity: "mild", classification: "contains" }];
  const report = (reportedBy: string) => ({ reportedBy, correctionType: "flag_wrong" as const, allergen: "Soy", note: null, photoPath: "/fake.jpg", origin: "user_initiated" as const });

  // Two removals filed against scans whose label didn't match the barcode's product (migration 0032).
  const mismatchedIds: string[] = [];
  for (const user of [USER_A, USER_B]) {
    const scanId = await makeScan(barcode, "contains_allergen", soy);
    await makeLabelExtraction(scanId, false);
    mismatchedIds.push((await recordCorrection({ scanId, ...report(user) })).id);
  }

  // A third, clean report: three distinct reporters, but only one whose evidence counts.
  const third = await recordCorrection({ scanId: await makeScan(barcode, "contains_allergen", soy), ...report(USER_C) });
  assert.equal(third.corroborated, false);

  // And when a claim does corroborate (add_caution, threshold 1), a mismatched row in it stays pending.
  const milk = [{ allergenName: "Milk", severity: "severe", classification: "clear" }];
  const mismatchedScan = await makeScan(barcode, "safe", milk);
  await makeLabelExtraction(mismatchedScan, false);
  const mismatchedAdd = await recordCorrection({ scanId: mismatchedScan, reportedBy: USER_A, correctionType: "flag_missing", allergen: "Milk", note: null, photoPath: "/fake.jpg", origin: "user_initiated" });
  const cleanAdd = await recordCorrection({ scanId: await makeScan(barcode, "safe", milk), reportedBy: USER_B, correctionType: "flag_missing", allergen: "Milk", note: null, photoPath: "/fake.jpg", origin: "user_initiated" });
  assert.equal(cleanAdd.corroborated, true);

  const { rows } = await pool.query<{ id: string; status: string }>(
    "SELECT id, status FROM product_corrections WHERE id = ANY($1)",
    [[...mismatchedIds, mismatchedAdd.id]],
  );
  assert.ok(rows.every((r) => r.status === "pending"), "mismatched reports are never marked corroborated");
});
