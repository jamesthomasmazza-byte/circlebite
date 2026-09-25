import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import { pool } from "../db/pool.js";
import type { AiClientResult } from "./types.js";
import type { AiVisionClientResult } from "./types.js";
import { runLabelScan } from "./labelScan.js";

// Real Postgres, same discipline as recordCorrection.test.ts/aiAccuracyReport.test.ts — this is
// mostly insert/branch logic that a fake DB layer can't meaningfully exercise. The AI layer is
// stubbed the same way reasonVerdict.test.ts stubs it (injected deps, never a real network call);
// labelScan.ts's own deps additionally let a test reach the REAL extractLabel/reasonVerdict
// (and therefore their own span-validation / fail-closed logic) with only the network call itself
// faked, rather than needing a wholesale fake that reimplements that logic.

const USER_A = "cccccccc-0000-0000-0000-000000000001";
const PROFILE_ID = "dddddddd-0000-0000-0000-000000000001";
const IMAGE = Buffer.from("fake-image-bytes");

// Returns extractLabelDeps (not a wholesale extractLabel override) — this exercises the REAL
// extractLabel.ts, only faking its own callAiVision seam, the same pattern used for reasonVerdict
// below (reasonVerdictDeps). That's what makes the "span validation" test further down able to
// reach real span-validation logic without reimplementing it in a fake.
function fakeExtractOk(overrides: Partial<Extract<AiVisionClientResult, { ok: true }>> = {}) {
  return {
    underDailySpendCap: async () => true,
    callAiVision: async (): Promise<AiVisionClientResult> => ({
      ok: true,
      ingredientsText: "Water, sugar, salt.",
      productName: null,
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

async function setAllergens(allergens: { name: string; severity: string; treatTracesAsUnsafe?: boolean }[]) {
  await pool.query("DELETE FROM allergens WHERE allergen_profile_id = $1", [PROFILE_ID]);
  for (const a of allergens) {
    await pool.query(
      "INSERT INTO allergens (allergen_profile_id, name, severity, treat_traces_as_unsafe) VALUES ($1, $2, $3, $4)",
      [PROFILE_ID, a.name, a.severity, a.treatTracesAsUnsafe ?? false],
    );
  }
}

before(async () => {
  await pool.query(
    `INSERT INTO users (id, email, password_hash, display_name, age_attested_adult, age_attested_at) VALUES
       ($1, 'labelscan-test-a@example.com', 'x', 'A', true, now())`,
    [USER_A],
  );
  await pool.query("INSERT INTO allergen_profiles (id, manager_id, label) VALUES ($1, $2, 'Test Profile')", [
    PROFILE_ID,
    USER_A,
  ]);
  await setAllergens([{ name: "Milk", severity: "severe", treatTracesAsUnsafe: true }]);
});

after(async () => {
  await pool.query("DELETE FROM product_corrections WHERE scan_id IN (SELECT id FROM scans WHERE allergen_profile_id = $1)", [
    PROFILE_ID,
  ]);
  await pool.query("DELETE FROM users WHERE id = ANY($1)", [[USER_A]]);
  await pool.end();
});

test("extraction failure: returns unable_to_confirm with usable copy, not a verdict, and no verdict_explanations row", async () => {
  const result = await runLabelScan(
    { userId: USER_A, allergenProfileId: PROFILE_ID, barcode: null, imageBuffer: IMAGE, mimeType: "image/jpeg" },
    { extractLabelDeps: { underDailySpendCap: async () => true, callAiVision: async () => ({ ok: false, reason: "request_failed" }) } },
  );

  assert.equal(result.result, "unable_to_confirm");
  assert.ok(result.explanation && result.explanation.length > 0);
  assert.equal(result.extraction_legible, false);
  assert.equal(result.extracted_text, null);

  const { rows: ve } = await pool.query("SELECT * FROM verdict_explanations WHERE scan_id = $1", [result.id]);
  assert.equal(ve.length, 0);

  const { rows: le } = await pool.query("SELECT failure_reason, legible FROM label_extractions WHERE scan_id = $1", [result.id]);
  assert.equal(le.length, 1);
  assert.equal(le[0].failure_reason, "request_failed");
  assert.equal(le[0].legible, null);
});

test("legible: false short-circuits to unable_to_confirm without calling reasonVerdict", async () => {
  let reasonVerdictCalled = false;
  const result = await runLabelScan(
    { userId: USER_A, allergenProfileId: PROFILE_ID, barcode: null, imageBuffer: IMAGE, mimeType: "image/jpeg" },
    {
      extractLabelDeps: fakeExtractOk({ legible: false, ingredientsText: "" }),
      reasonVerdict: async () => {
        reasonVerdictCalled = true;
        throw new Error("reasonVerdict must not be called for an illegible read");
      },
    },
  );

  assert.equal(result.result, "unable_to_confirm");
  assert.equal(result.extraction_legible, false);
  assert.equal(reasonVerdictCalled, false);

  const { rows: ve } = await pool.query("SELECT * FROM verdict_explanations WHERE scan_id = $1", [result.id]);
  assert.equal(ve.length, 0);
});

test("legible: true, complete: false short-circuits to unable_to_confirm without calling reasonVerdict — the dangerous case", async () => {
  // The whole point of the complete/legible split: text that transcribes cleanly but is cut off
  // must never reach the reasoning step, because a dropped allergen line would leave no trace.
  let reasonVerdictCalled = false;
  const result = await runLabelScan(
    { userId: USER_A, allergenProfileId: PROFILE_ID, barcode: null, imageBuffer: IMAGE, mimeType: "image/jpeg" },
    {
      extractLabelDeps: fakeExtractOk({
        legible: true,
        complete: false,
        incompleteReason: "text continues past the right edge",
        ingredientsText: "Water, sugar, salt",
      }),
      reasonVerdict: async () => {
        reasonVerdictCalled = true;
        throw new Error("reasonVerdict must not be called for an incomplete read");
      },
    },
  );

  assert.equal(result.result, "unable_to_confirm");
  assert.equal(result.extraction_legible, true);
  assert.equal(result.extraction_complete, false);
  assert.equal(reasonVerdictCalled, false);
  assert.match(result.explanation ?? "", /cut off/);
});

test("a dropped allergen (nothing found, deterministic and AI both clear) cannot produce a clean 'safe' — downgrades to unable_to_confirm", async () => {
  const result = await runLabelScan(
    { userId: USER_A, allergenProfileId: PROFILE_ID, barcode: null, imageBuffer: IMAGE, mimeType: "image/jpeg" },
    {
      extractLabelDeps: fakeExtractOk({ ingredientsText: "Water, sugar, salt." }), // no mention of milk
      reasonVerdict: async () => ({
        findings: [],
        unresolvedTerms: [],
        failed: false,
        failureReason: null,
        model: "test-model",
        promptVersion: "path-c-extract-v1",
        latencyMs: 5,
        tokensIn: 10,
        tokensOut: 5,
        costCents: 0.01,
      }),
    },
  );

  assert.notEqual(result.result, "safe");
  assert.equal(result.result, "unable_to_confirm");
  assert.equal(result.confidence, "low");
  assert.match(result.explanation ?? "", /hasn't been confirmed safe/);

  const { rows } = await pool.query("SELECT result, source, confidence FROM scans WHERE id = $1", [result.id]);
  assert.equal(rows[0].result, "unable_to_confirm");
  assert.equal(rows[0].source, "label_photo");
});

test("span validation: a citedSpan not present in the extracted text is discarded, through the REAL reasonVerdict/spanValidator", async () => {
  // extractLabel is faked (controls the text), but reasonVerdict is the REAL one from
  // reasonVerdict.ts — only its own callAi seam is faked, via reasonVerdictDeps — so this exercises
  // real span validation, not a stand-in for it.
  const result = await runLabelScan(
    { userId: USER_A, allergenProfileId: PROFILE_ID, barcode: null, imageBuffer: IMAGE, mimeType: "image/jpeg" },
    {
      extractLabelDeps: fakeExtractOk({ ingredientsText: "Water, sugar, salt." }),
      reasonVerdictDeps: {
        underDailySpendCap: async () => true,
        callAi: fakeReasonOk({
          findings: [
            { allergen: "Milk", present: "yes", citedSpan: "milk powder", reason: "hallucinated — not actually in the text", confidence: "medium" },
          ],
        }),
      },
    },
  );

  // The hallucinated span isn't in "Water, sugar, salt." — spanValidator downgrades it to
  // "unknown", which mergeVerdict then treats as unresolved (never a clean "clear"/"safe"), not a
  // real "contains" claim.
  assert.notEqual(result.result, "contains_allergen");
  const milk = (result.matched_allergens as { allergenName: string; classification: string; citedSpan?: string }[]).find(
    (m) => m.allergenName === "Milk",
  );
  assert.ok(milk);
  assert.equal(milk!.classification, "unresolved");
  assert.equal(milk!.citedSpan, undefined);
});

const REASON_DEPS_OK = { underDailySpendCap: async () => true, callAi: fakeReasonOk() };

test("a barcode-less scan (standalone entry point) stores barcode NULL on the scan row", async () => {
  const result = await runLabelScan(
    { userId: USER_A, allergenProfileId: PROFILE_ID, barcode: null, imageBuffer: IMAGE, mimeType: "image/jpeg" },
    { extractLabelDeps: fakeExtractOk(), reasonVerdictDeps: REASON_DEPS_OK },
  );
  assert.equal(result.barcode, null);

  const { rows } = await pool.query("SELECT barcode, source FROM scans WHERE id = $1", [result.id]);
  assert.equal(rows[0].barcode, null);
  assert.equal(rows[0].source, "label_photo");
});

test("a barcode carried forward is dropped to NULL when Open Food Facts now has usable data for it — never trusted as-is", async () => {
  const result = await runLabelScan(
    { userId: USER_A, allergenProfileId: PROFILE_ID, barcode: "4000000000099", imageBuffer: IMAGE, mimeType: "image/jpeg" },
    {
      extractLabelDeps: fakeExtractOk(),
      reasonVerdictDeps: REASON_DEPS_OK,
      getProduct: async () => ({
        found: true,
        name: "Now Found",
        brand: null,
        ingredientsText: "water, sugar",
        allergensTags: [],
        tracesTags: [],
        lastUpdated: null,
        raw: null,
      }),
    },
  );

  assert.equal(result.barcode, null);
});

test("a carried-forward barcode still absent/thin in Open Food Facts is kept and attached to the scan", async () => {
  const result = await runLabelScan(
    { userId: USER_A, allergenProfileId: PROFILE_ID, barcode: "4000000000098", imageBuffer: IMAGE, mimeType: "image/jpeg" },
    {
      extractLabelDeps: fakeExtractOk(),
      reasonVerdictDeps: REASON_DEPS_OK,
      getProduct: async () => ({
        found: false,
        name: null,
        brand: null,
        ingredientsText: null,
        allergensTags: [],
        tracesTags: [],
        lastUpdated: null,
        raw: null,
      }),
    },
  );

  assert.equal(result.barcode, "4000000000098");
  const { rows } = await pool.query("SELECT barcode FROM scans WHERE id = $1", [result.id]);
  assert.equal(rows[0].barcode, "4000000000098");
});
