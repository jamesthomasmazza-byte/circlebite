import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import { pool } from "../db/pool.js";
import { combineLabelScan, confirmProductIdentity } from "./combineScan.js";
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
  productName: string;
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

test("a mismatch blocks: the original scan is byte-for-byte unchanged, never partially updated", async () => {
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
    { extractLabelDeps: fakeExtractOk({ productName: "Totally Different Snack Bar" }) },
  );

  assert.equal(outcome.status, "mismatch");

  const after1 = await fetchScan(original.id);
  assert.deepEqual(after1, original, "the scan row must be identical to what it was before the combine attempt");

  const { rows: extractions } = await pool.query(
    "SELECT matched_product_identity, identity_confirmed_by_user FROM label_extractions WHERE scan_id = $1",
    [original.id],
  );
  assert.equal(extractions.length, 1);
  assert.equal(extractions[0].matched_product_identity, false);
  assert.equal(extractions[0].identity_confirmed_by_user, null);
});

test("an unreadable photo also leaves the original scan untouched", async () => {
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

test("matching identity: the scan is updated to source 'combined', label_stricter escalates a clear allergen", async () => {
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
    const milk = outcome.matchedAllergens.find((m) => m.allergenName === "Milk");
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

test("confirming 'same_product' after a mismatch finalizes the combine against the SAME scan row", async () => {
  const original = await insertBarcodeScan({
    barcode: "3333333333333",
    productName: "Crackers",
    result: "safe",
    matchedAllergens: [{ allergenName: "Milk", matched: false, source: null, severity: "severe", classification: "clear" }],
  });

  const mismatch = await combineLabelScan(
    { scanId: original.id, imageBuffer: IMAGE, mimeType: "image/jpeg" },
    { extractLabelDeps: fakeExtractOk({ productName: "Something Else Entirely", ingredientsText: "flour, sugar" }) },
  );
  assert.equal(mismatch.status, "mismatch");
  if (mismatch.status !== "mismatch") throw new Error("unreachable");

  const resolved = await confirmProductIdentity(
    { userId: USER_A, extractionId: mismatch.extractionId, decision: "same_product" },
    { reasonVerdictDeps: REASON_DEPS_OK },
  );

  assert.equal(resolved.status, "combined");
  if (resolved.status === "combined") {
    assert.equal(resolved.scanId, original.id);
  }

  const after1 = await fetchScan(original.id);
  assert.equal(after1.source, "combined");

  const { rows: extractions } = await pool.query("SELECT identity_confirmed_by_user FROM label_extractions WHERE id = $1", [
    mismatch.extractionId,
  ]);
  assert.equal(extractions[0].identity_confirmed_by_user, true);
});

test("confirming 'different_product' leaves the original scan untouched and creates a new standalone scan", async () => {
  const original = await insertBarcodeScan({
    barcode: "4444444444444",
    productName: "Granola Bars",
    result: "contains_allergen",
    matchedAllergens: [
      { allergenName: "Milk", matched: true, source: "tag", severity: "severe", classification: "contains", aiEscalated: false },
    ],
  });

  const mismatch = await combineLabelScan(
    { scanId: original.id, imageBuffer: IMAGE, mimeType: "image/jpeg" },
    { extractLabelDeps: fakeExtractOk({ productName: "A Totally Unrelated Cereal", ingredientsText: "oats, sugar" }) },
  );
  assert.equal(mismatch.status, "mismatch");
  if (mismatch.status !== "mismatch") throw new Error("unreachable");

  const resolved = await confirmProductIdentity(
    { userId: USER_A, extractionId: mismatch.extractionId, decision: "different_product" },
    { reasonVerdictDeps: REASON_DEPS_OK },
  );

  assert.equal(resolved.status, "standalone");

  // The original barcode scan is exactly as it was before any of this happened.
  const after1 = await fetchScan(original.id);
  assert.equal(after1.source, "barcode");
  assert.equal(after1.result, "contains_allergen");

  if (resolved.status === "standalone") {
    assert.notEqual(resolved.scanId, original.id);
    const { rows: newScanRows } = await pool.query("SELECT barcode, source FROM scans WHERE id = $1", [resolved.scanId]);
    assert.equal(newScanRows[0].barcode, null);
    assert.equal(newScanRows[0].source, "label_photo");
  }

  const { rows: extractions } = await pool.query("SELECT identity_confirmed_by_user FROM label_extractions WHERE id = $1", [
    mismatch.extractionId,
  ]);
  assert.equal(extractions[0].identity_confirmed_by_user, false);
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
