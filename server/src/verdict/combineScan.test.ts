import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import { pool } from "../db/pool.js";
import { combineLabelScan, discardLabelEvidence } from "./combineScan.js";
import type { AiClientResult, AiVisionClientResult } from "./types.js";

// Real Postgres, same discipline as labelScan.test.ts — this is mostly insert/branch/guard logic
// a fake DB layer can't meaningfully exercise, and the whole point of the tests below is proving
// what actually landed in the `scans` row, not just what the function returned.

const USER_A = "eeeeeeee-0000-0000-0000-000000000001";
const PROFILE_ID = "ffffffff-0000-0000-0000-000000000001";
const IMAGE = Buffer.from("fake-image-bytes");

function fakeExtractOk(overrides: Partial<Extract<AiVisionClientResult, { ok: true }>> = {}) {
  return {
    underDailySpendCap: async () => true,
    callAiVision: async (): Promise<AiVisionClientResult> => ({
      ok: true,
      ingredientsText: "flour, sugar, salt",
      productName: "Real Product",
      contains: [],
      mayContain: [],
      legible: true,
      complete: true,
      incompleteReason: null,
      language: "en",
      latencyMs: 10,
      tokensIn: 200,
      tokensOut: 50,
      costCents: 0.05,
      ...overrides,
    }),
  };
}

function fakeReasonOk(overrides: Partial<Extract<AiClientResult, { ok: true }>> = {}) {
  return async (): Promise<AiClientResult> => ({
    ok: true,
    findings: [],
    unresolvedTerms: [],
    latencyMs: 10,
    tokensIn: 100,
    tokensOut: 20,
    costCents: 0.02,
    ...overrides,
  });
}

const REASON_DEPS_OK = { underDailySpendCap: async () => true, callAi: fakeReasonOk() };

type ScanRow = {
  id: string;
  barcode: string | null;
  product_name: string | null;
  result: string;
  source: string;
  confidence: string | null;
  matched_allergens: unknown;
};

async function insertBarcodeScan(input: {
  barcode: string;
  productName: string | null;
  result: string;
  matchedAllergens: unknown[];
}): Promise<ScanRow> {
  const { rows } = await pool.query<ScanRow>(
    `INSERT INTO scans
       (scanner_id, allergen_profile_id, barcode, product_name, result, matched_allergens, source)
     VALUES ($1, $2, $3, $4, $5, $6, 'barcode')
     RETURNING id, barcode, product_name, result, source, confidence, matched_allergens`,
    [USER_A, PROFILE_ID, input.barcode, input.productName, input.result, JSON.stringify(input.matchedAllergens)],
  );
  return rows[0];
}

async function fetchScan(id: string): Promise<ScanRow> {
  const { rows } = await pool.query<ScanRow>(
    "SELECT id, barcode, product_name, result, source, confidence, matched_allergens FROM scans WHERE id = $1",
    [id],
  );
  return rows[0];
}

before(async () => {
  await pool.query(
    `INSERT INTO users (id, email, password_hash, display_name, age_attested_adult, age_attested_at) VALUES
       ($1, 'combinescan-test-a@example.com', 'x', 'A', true, now())`,
    [USER_A],
  );
  await pool.query("INSERT INTO allergen_profiles (id, manager_id, label) VALUES ($1, $2, 'Test Profile')", [
    PROFILE_ID,
    USER_A,
  ]);
  await pool.query("DELETE FROM allergens WHERE allergen_profile_id = $1", [PROFILE_ID]);
  await pool.query(
    "INSERT INTO allergens (allergen_profile_id, name, severity, treat_traces_as_unsafe) VALUES ($1, 'Milk', 'severe', true)",
    [PROFILE_ID],
  );
});

after(async () => {
  await pool.query("DELETE FROM users WHERE id = ANY($1)", [[USER_A]]);
  await pool.end();
});

test("a mismatched label still merges automatically, flagged as identity_mismatch — not blocked", async () => {
  const original = await insertBarcodeScan({
    barcode: "1111111111111",
    productName: "Real Milk Product",
    result: "contains_allergen",
    matchedAllergens: [
      { allergenName: "Milk", matched: true, source: "tag", severity: "severe", classification: "contains", aiEscalated: false },
    ],
  });

  const outcome = await combineLabelScan(
    { scanId: original.id, imageBuffer: IMAGE, mimeType: "image/jpeg" },
    {
      extractLabelDeps: fakeExtractOk({ productName: "Totally Different Snack Bar" }),
      reasonVerdictDeps: REASON_DEPS_OK,
    },
  );

  assert.equal(outcome.status, "combined");
  if (outcome.status !== "combined") throw new Error("unreachable");
  assert.ok(outcome.identity_mismatch);
  assert.equal(outcome.identity_mismatch!.off_product_name, "Real Milk Product");
  assert.equal(outcome.identity_mismatch!.extracted_product_name, "Totally Different Snack Bar");

  // Escalate-only holds regardless of the mismatch: the barcode's own "contains" finding stands —
  // the label stayed silent about Milk (label_looser), and silence can't clear a decided finding.
  assert.equal(outcome.result, "contains_allergen");
  const milk = outcome.matched_allergens.find((m) => m.allergenName === "Milk");
  assert.ok(milk);
  assert.equal(milk!.classification, "contains");
  assert.equal(milk!.disagreement, "label_looser");

  const after1 = await fetchScan(original.id);
  assert.equal(after1.source, "combined");
  assert.equal(after1.result, "contains_allergen");

  const { rows: extractions } = await pool.query(
    `SELECT matched_product_identity, identity_confirmed_by_user, pre_combine_result, pre_combine_matched_allergens
     FROM label_extractions WHERE scan_id = $1`,
    [original.id],
  );
  assert.equal(extractions.length, 1);
  assert.equal(extractions[0].matched_product_identity, false);
  assert.equal(extractions[0].identity_confirmed_by_user, null);
  assert.equal(extractions[0].pre_combine_result, "contains_allergen");
  assert.deepEqual(extractions[0].pre_combine_matched_allergens, original.matched_allergens);
});

test("an unreadable photo leaves the original scan untouched", async () => {
  const original = await insertBarcodeScan({
    barcode: "1111111111112",
    productName: "Another Product",
    result: "safe",
    matchedAllergens: [{ allergenName: "Milk", matched: false, source: null, severity: "severe", classification: "clear" }],
  });

  const outcome = await combineLabelScan(
    { scanId: original.id, imageBuffer: IMAGE, mimeType: "image/jpeg" },
    { extractLabelDeps: fakeExtractOk({ legible: false }) },
  );

  assert.equal(outcome.status, "unreadable");
  const after1 = await fetchScan(original.id);
  assert.deepEqual(after1, original);
});

test("matching identity: the scan is updated to source 'combined', label_stricter escalates a clear allergen, identity_mismatch is null", async () => {
  const original = await insertBarcodeScan({
    barcode: "2222222222222",
    productName: "Cookies",
    result: "safe",
    matchedAllergens: [{ allergenName: "Milk", matched: false, source: null, severity: "severe", classification: "clear" }],
  });

  const outcome = await combineLabelScan(
    { scanId: original.id, imageBuffer: IMAGE, mimeType: "image/jpeg" },
    {
      extractLabelDeps: fakeExtractOk({ productName: "Cookies", ingredientsText: "flour, sugar, milk powder" }),
      reasonVerdictDeps: {
        underDailySpendCap: async () => true,
        callAi: fakeReasonOk({
          findings: [{ allergen: "Milk", present: "yes", citedSpan: "milk powder", reason: "direct ingredient", confidence: "high" }],
        }),
      },
    },
  );

  assert.equal(outcome.status, "combined");
  if (outcome.status === "combined") {
    assert.equal(outcome.result, "contains_allergen");
    assert.equal(outcome.identity_mismatch, null);
    const milk = outcome.matched_allergens.find((m) => m.allergenName === "Milk");
    assert.ok(milk);
    assert.equal(milk!.classification, "contains");
    assert.equal(milk!.disagreement, "label_stricter");
  }

  const after1 = await fetchScan(original.id);
  assert.equal(after1.source, "combined");
  assert.equal(after1.result, "contains_allergen");

  const { rows: ve } = await pool.query("SELECT evidence_source FROM verdict_explanations WHERE scan_id = $1", [original.id]);
  assert.equal(ve.length, 1);
  assert.equal(ve[0].evidence_source, "label");
});

test("a barcode with no product record combines as label_only — the explanation never claims the product record was checked", async () => {
  // The live case from 2026-09-28 (barcode 2113792886078): a barcode was entered, so the scan is
  // 'combined', but there was no product behind it — computeVerdict's empty fail-closed shape.
  const original = await insertBarcodeScan({
    barcode: "3333333333333",
    productName: null,
    result: "unable_to_confirm",
    matchedAllergens: [],
  });

  const outcome = await combineLabelScan(
    { scanId: original.id, imageBuffer: IMAGE, mimeType: "image/jpeg" },
    { extractLabelDeps: fakeExtractOk(), reasonVerdictDeps: REASON_DEPS_OK },
  );

  assert.equal(outcome.status, "combined");
  if (outcome.status !== "combined") throw new Error("unreachable");
  assert.equal(outcome.evidence, "label_only");
  assert.equal(outcome.result, "unable_to_confirm");
  assert.equal(outcome.matched_allergens.find((m) => m.allergenName === "Milk")!.classification, "unchecked");
  assert.doesNotMatch(outcome.explanation ?? "", /product record/);
  assert.match(outcome.explanation ?? "", /this photo/);
  assert.equal((await fetchScan(original.id)).source, "combined");
});

test("a barcode with a product record combines as barcode_and_label", async () => {
  const original = await insertBarcodeScan({
    barcode: "3333333333334",
    productName: "Real Product",
    result: "safe",
    matchedAllergens: [{ allergenName: "Milk", matched: false, source: null, severity: "severe", classification: "clear" }],
  });

  const outcome = await combineLabelScan(
    { scanId: original.id, imageBuffer: IMAGE, mimeType: "image/jpeg" },
    { extractLabelDeps: fakeExtractOk(), reasonVerdictDeps: REASON_DEPS_OK },
  );

  assert.equal(outcome.status, "combined");
  if (outcome.status !== "combined") throw new Error("unreachable");
  assert.equal(outcome.evidence, "barcode_and_label");
  assert.equal(outcome.explanation, "Neither the product record nor the label you photographed listed any allergens from this profile.");
});

test("discardLabelEvidence reverts a mismatched combine back to the pre-combine barcode-only verdict", async () => {
  const original = await insertBarcodeScan({
    barcode: "3333333333333",
    productName: "Crackers",
    result: "safe",
    matchedAllergens: [{ allergenName: "Milk", matched: false, source: null, severity: "severe", classification: "clear" }],
  });

  const outcome = await combineLabelScan(
    { scanId: original.id, imageBuffer: IMAGE, mimeType: "image/jpeg" },
    {
      extractLabelDeps: fakeExtractOk({ productName: "Something Else Entirely", ingredientsText: "flour, sugar" }),
      reasonVerdictDeps: REASON_DEPS_OK,
    },
  );
  assert.equal(outcome.status, "combined");
  if (outcome.status !== "combined") throw new Error("unreachable");
  assert.ok(outcome.identity_mismatch);

  const afterCombine = await fetchScan(original.id);
  assert.equal(afterCombine.source, "combined");

  const discarded = await discardLabelEvidence({ extractionId: outcome.identity_mismatch!.extraction_id });
  assert.equal(discarded.status, "discarded");
  if (discarded.status !== "discarded") throw new Error("unreachable");
  assert.equal(discarded.scan_id, original.id);
  assert.equal(discarded.result, original.result);
  assert.deepEqual(discarded.matched_allergens, original.matched_allergens);

  const after1 = await fetchScan(original.id);
  assert.equal(after1.source, "barcode");
  assert.equal(after1.result, original.result);
  assert.deepEqual(after1.matched_allergens, original.matched_allergens);

  const { rows: extractions } = await pool.query("SELECT identity_confirmed_by_user FROM label_extractions WHERE id = $1", [
    outcome.identity_mismatch!.extraction_id,
  ]);
  assert.equal(extractions[0].identity_confirmed_by_user, false);
});

test("discardLabelEvidence rejects a second discard on the same extraction", async () => {
  const original = await insertBarcodeScan({
    barcode: "4444444444444",
    productName: "Granola Bars",
    result: "contains_allergen",
    matchedAllergens: [
      { allergenName: "Milk", matched: true, source: "tag", severity: "severe", classification: "contains", aiEscalated: false },
    ],
  });

  const outcome = await combineLabelScan(
    { scanId: original.id, imageBuffer: IMAGE, mimeType: "image/jpeg" },
    {
      extractLabelDeps: fakeExtractOk({ productName: "A Totally Unrelated Cereal", ingredientsText: "oats, sugar" }),
      reasonVerdictDeps: REASON_DEPS_OK,
    },
  );
  assert.equal(outcome.status, "combined");
  if (outcome.status !== "combined") throw new Error("unreachable");
  const extractionId = outcome.identity_mismatch!.extraction_id;

  await discardLabelEvidence({ extractionId });

  await assert.rejects(
    () => discardLabelEvidence({ extractionId }),
    (err: unknown) => (err as { status?: number }).status === 400,
  );
});

test("discardLabelEvidence rejects an extraction whose identity actually matched", async () => {
  const original = await insertBarcodeScan({
    barcode: "5555555555556",
    productName: "Chips",
    result: "safe",
    matchedAllergens: [{ allergenName: "Milk", matched: false, source: null, severity: "severe", classification: "clear" }],
  });

  const outcome = await combineLabelScan(
    { scanId: original.id, imageBuffer: IMAGE, mimeType: "image/jpeg" },
    { extractLabelDeps: fakeExtractOk({ productName: "Chips" }), reasonVerdictDeps: REASON_DEPS_OK },
  );
  assert.equal(outcome.status, "combined");
  if (outcome.status !== "combined") throw new Error("unreachable");
  assert.equal(outcome.identity_mismatch, null);

  const { rows: extractions } = await pool.query("SELECT id FROM label_extractions WHERE scan_id = $1", [original.id]);

  await assert.rejects(
    () => discardLabelEvidence({ extractionId: extractions[0].id }),
    (err: unknown) => (err as { status?: number }).status === 400,
  );
});

test("re-combining an already-combined scan is rejected, not silently re-applied", async () => {
  const original = await insertBarcodeScan({
    barcode: "5555555555555",
    productName: "Chips",
    result: "safe",
    matchedAllergens: [{ allergenName: "Milk", matched: false, source: null, severity: "severe", classification: "clear" }],
  });
  await combineLabelScan(
    { scanId: original.id, imageBuffer: IMAGE, mimeType: "image/jpeg" },
    { extractLabelDeps: fakeExtractOk({ productName: "Chips" }), reasonVerdictDeps: REASON_DEPS_OK },
  );

  await assert.rejects(
    () =>
      combineLabelScan(
        { scanId: original.id, imageBuffer: IMAGE, mimeType: "image/jpeg" },
        { extractLabelDeps: fakeExtractOk({ productName: "Chips" }), reasonVerdictDeps: REASON_DEPS_OK },
      ),
    (err: unknown) => (err as { status?: number }).status === 400,
  );
});
