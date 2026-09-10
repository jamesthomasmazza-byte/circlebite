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
  barcode: string,
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
    }),
  );
});

test("rejects a flag_wrong correction with no allergen", async () => {
  const scanId = await makeScan("1000000000002", "contains_allergen", []);
  await assert.rejects(() =>
    recordCorrection({ scanId, reportedBy: USER_A, correctionType: "flag_wrong", allergen: null, note: null, photoPath: "/fake.jpg" }),
  );
});

test("target is off_data for a deterministic-sourced allergen, with no verdict_explanation_id", async () => {
  const scanId = await makeScan("1000000000003", "contains_allergen", [
    { allergenName: "Milk", severity: "severe", classification: "contains", aiEscalated: false },
  ]);
  await recordCorrection({ scanId, reportedBy: USER_A, correctionType: "flag_wrong", allergen: "Milk", note: null, photoPath: "/fake.jpg" });

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

  await recordCorrection({ scanId, reportedBy: USER_A, correctionType: "flag_wrong", allergen: "Milk", note: null, photoPath: "/fake.jpg" });

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
  await recordCorrection({ scanId, reportedBy: USER_A, correctionType: "flag_wrong", allergen: "Milk", note: "not actually milk", photoPath: "/fake.jpg" });

  const { rows } = await pool.query("SELECT verdict_at_report, source_text_at_report, note FROM product_corrections WHERE scan_id = $1", [scanId]);
  assert.equal(rows[0].verdict_at_report, "contains_allergen");
  assert.equal(rows[0].source_text_at_report, "water, sugar, sodium caseinate");
  assert.equal(rows[0].note, "not actually milk");
});

test("add_caution corroborates on the first report — threshold of 1", async () => {
  const scanId = await makeScan("1000000000006", "safe", [{ allergenName: "Egg", severity: "moderate", classification: "clear" }]);
  const result = await recordCorrection({ scanId, reportedBy: USER_A, correctionType: "flag_missing", allergen: "Egg", note: null, photoPath: "/fake.jpg" });
  assert.equal(result.corroborated, true);
  assert.equal(result.status, "corroborated");
});

test("remove_caution stays pending until the third distinct reporter — threshold of 3", async () => {
  const barcode = "1000000000007";
  const scan1 = await makeScan(barcode, "contains_allergen", [{ allergenName: "Soy", severity: "mild", classification: "contains" }]);
  const scan2 = await makeScan(barcode, "contains_allergen", [{ allergenName: "Soy", severity: "mild", classification: "contains" }]);
  const scan3 = await makeScan(barcode, "contains_allergen", [{ allergenName: "Soy", severity: "mild", classification: "contains" }]);

  const first = await recordCorrection({ scanId: scan1, reportedBy: USER_A, correctionType: "flag_wrong", allergen: "Soy", note: null, photoPath: "/fake.jpg" });
  assert.equal(first.corroborated, false);

  const second = await recordCorrection({ scanId: scan2, reportedBy: USER_B, correctionType: "flag_wrong", allergen: "Soy", note: null, photoPath: "/fake.jpg" });
  assert.equal(second.corroborated, false);

  const third = await recordCorrection({ scanId: scan3, reportedBy: USER_C, correctionType: "flag_wrong", allergen: "Soy", note: null, photoPath: "/fake.jpg" });
  assert.equal(third.corroborated, true);

  // All three, including the earlier pending ones, flip to corroborated together.
  const { rows } = await pool.query("SELECT status FROM product_corrections WHERE barcode = $1 AND allergen = 'Soy'", [barcode]);
  assert.equal(rows.length, 3);
  assert.ok(rows.every((r) => r.status === "corroborated"));
});

test("wrong_product uses its own corroboration bucket, keyed by barcode alone (allergen is null)", async () => {
  const barcode = "1000000000008";
  const scan1 = await makeScan(barcode, "contains_allergen", []);
  const scan2 = await makeScan(barcode, "contains_allergen", []);
  const scan3 = await makeScan(barcode, "contains_allergen", []);

  await recordCorrection({ scanId: scan1, reportedBy: USER_A, correctionType: "wrong_product", allergen: null, note: null, photoPath: "/fake.jpg" });
  await recordCorrection({ scanId: scan2, reportedBy: USER_B, correctionType: "wrong_product", allergen: null, note: null, photoPath: "/fake.jpg" });
  const third = await recordCorrection({ scanId: scan3, reportedBy: USER_C, correctionType: "wrong_product", allergen: null, note: null, photoPath: "/fake.jpg" });

  assert.equal(third.corroborated, true);
});

test("a remove_caution bucket never corroborates while a corroborated add_caution exists for the same allergen — the warning survives", async () => {
  const barcode = "1000000000009";

  // First, corroborate an add_caution for Peanut (threshold 1).
  const addScan = await makeScan(barcode, "safe", [{ allergenName: "Peanut", severity: "severe", classification: "clear" }]);
  await recordCorrection({ scanId: addScan, reportedBy: USER_A, correctionType: "flag_missing", allergen: "Peanut", note: null, photoPath: "/fake.jpg" });

  // Now try to remove it with 3 reporters — should never corroborate, despite hitting the count.
  const removeScan1 = await makeScan(barcode, "contains_allergen", [{ allergenName: "Peanut", severity: "severe", classification: "contains" }]);
  const removeScan2 = await makeScan(barcode, "contains_allergen", [{ allergenName: "Peanut", severity: "severe", classification: "contains" }]);
  const removeScan3 = await makeScan(barcode, "contains_allergen", [{ allergenName: "Peanut", severity: "severe", classification: "contains" }]);

  await recordCorrection({ scanId: removeScan1, reportedBy: USER_A, correctionType: "flag_wrong", allergen: "Peanut", note: null, photoPath: "/fake.jpg" });
  await recordCorrection({ scanId: removeScan2, reportedBy: USER_B, correctionType: "flag_wrong", allergen: "Peanut", note: null, photoPath: "/fake.jpg" });
  const third = await recordCorrection({ scanId: removeScan3, reportedBy: USER_C, correctionType: "flag_wrong", allergen: "Peanut", note: null, photoPath: "/fake.jpg" });

  assert.equal(third.corroborated, false);
  const { rows } = await pool.query(
    "SELECT status FROM product_corrections WHERE barcode = $1 AND allergen = 'Peanut' AND direction = 'remove_caution'",
    [barcode],
  );
  assert.ok(rows.every((r) => r.status === "pending"));
});

test("a different allergen on the same barcode gets its own independent corroboration count", async () => {
  const barcode = "1000000000010";
  const milkScan = await makeScan(barcode, "contains_allergen", [{ allergenName: "Milk", severity: "severe", classification: "contains" }]);
  const soyScan = await makeScan(barcode, "contains_allergen", [{ allergenName: "Soy", severity: "mild", classification: "contains" }]);

  const milkResult = await recordCorrection({ scanId: milkScan, reportedBy: USER_A, correctionType: "flag_wrong", allergen: "Milk", note: null, photoPath: "/fake.jpg" });
  const soyResult = await recordCorrection({ scanId: soyScan, reportedBy: USER_A, correctionType: "flag_wrong", allergen: "Soy", note: null, photoPath: "/fake.jpg" });

  // One reporter each, threshold 3 for remove_caution — neither should corroborate yet.
  assert.equal(milkResult.corroborated, false);
  assert.equal(soyResult.corroborated, false);
});
