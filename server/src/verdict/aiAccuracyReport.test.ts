import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import { pool } from "../db/pool.js";
import { aggregateEscalations, aiAccuracyReport, SMALL_SAMPLE_THRESHOLD } from "./aiAccuracyReport.js";

// Pure aggregation math — no DB needed, fast, exercises the threshold/grouping logic directly.
test("aggregateEscalations: below the threshold the rate is null but counts are exact", () => {
  const rows = [
    { scan_id: "s1", allergen: "Milk", classification: "contains" as const, model: "m", prompt_version: "v1", overruled: true },
    { scan_id: "s2", allergen: "Milk", classification: "contains" as const, model: "m", prompt_version: "v1", overruled: false },
  ];
  const { overall } = aggregateEscalations(rows);
  assert.equal(overall.escalation.escalations, 2);
  assert.equal(overall.escalation.overruled, 1);
  assert.equal(overall.escalation.rate, null);
});

test("aggregateEscalations: rate appears once escalations reach the threshold", () => {
  const rows = Array.from({ length: SMALL_SAMPLE_THRESHOLD }, (_, i) => ({
    scan_id: `s${i}`,
    allergen: "Milk",
    classification: "contains" as const,
    model: "m",
    prompt_version: "v1",
    overruled: i < 5,
  }));
  const { overall } = aggregateEscalations(rows);
  assert.equal(overall.escalation.escalations, SMALL_SAMPLE_THRESHOLD);
  assert.equal(overall.escalation.overruled, 5);
  assert.equal(overall.escalation.rate, 5 / SMALL_SAMPLE_THRESHOLD);
});

test("aggregateEscalations: unresolved findings are counted separately from contains/caution", () => {
  const rows = [
    { scan_id: "s1", allergen: "Milk", classification: "contains" as const, model: "m", prompt_version: "v1", overruled: false },
    { scan_id: "s2", allergen: "Milk", classification: "unresolved" as const, model: "m", prompt_version: "v1", overruled: true },
  ];
  const { overall } = aggregateEscalations(rows);
  assert.equal(overall.escalation.escalations, 1);
  assert.equal(overall.unresolved.escalations, 1);
  assert.equal(overall.unresolved.overruled, 1);
});

test("aggregateEscalations: groups by allergen case-insensitively", () => {
  const rows = [
    { scan_id: "s1", allergen: "Milk", classification: "contains" as const, model: "m", prompt_version: "v1", overruled: false },
    { scan_id: "s2", allergen: "milk", classification: "contains" as const, model: "m", prompt_version: "v1", overruled: false },
  ];
  const { byAllergen } = aggregateEscalations(rows);
  assert.equal(byAllergen.length, 1);
  assert.equal(byAllergen[0].allergen, "milk");
  assert.equal(byAllergen[0].escalation.escalations, 2);
});

test("aggregateEscalations: groups by model and prompt version jointly", () => {
  const rows = [
    { scan_id: "s1", allergen: "Milk", classification: "contains" as const, model: "m1", prompt_version: "v1", overruled: false },
    { scan_id: "s2", allergen: "Milk", classification: "contains" as const, model: "m1", prompt_version: "v2", overruled: false },
  ];
  const { byModelPromptVersion } = aggregateEscalations(rows);
  assert.equal(byModelPromptVersion.length, 2);
});

// Real Postgres from here — the join between scans.matched_allergens, verdict_explanations, and
// product_corrections is exactly the kind of logic a fake DB layer can't meaningfully exercise
// (same discipline as recordCorrection.test.ts).
const USER_A = "ffffffff-0000-0000-0000-000000000001";
const PROFILE_ID = "abcdef00-0000-0000-0000-000000000001";

async function makeScan(barcode: string, matchedAllergens: unknown[]): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO scans (allergen_profile_id, barcode, result, matched_allergens) VALUES ($1, $2, 'contains_allergen', $3) RETURNING id`,
    [PROFILE_ID, barcode, JSON.stringify(matchedAllergens)],
  );
  return rows[0].id;
}

async function makeVerdictExplanation(
  scanId: string,
  opts: { model?: string; promptVersion?: string; failureReason?: string | null } = {},
) {
  await pool.query(
    `INSERT INTO verdict_explanations (scan_id, model, prompt_version, verdict, confidence, failure_reason)
     VALUES ($1, $2, $3, 'contains_allergen', 'medium', $4)`,
    [scanId, opts.model ?? "test-model", opts.promptVersion ?? "test-v1", opts.failureReason ?? null],
  );
}

async function makeCorrection(
  scanId: string,
  barcode: string,
  opts: {
    correctionType: "flag_wrong" | "flag_missing" | "wrong_product";
    direction: "add_caution" | "remove_caution";
    allergen: string | null;
    target: "off_data" | "ai_verdict";
    status?: "pending" | "corroborated" | "rejected";
  },
) {
  await pool.query(
    `INSERT INTO product_corrections
       (scan_id, barcode, reported_by, correction_type, direction, allergen, target, verdict_at_report, photo_path, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'contains_allergen', '/fake.jpg', $8)`,
    [scanId, barcode, USER_A, opts.correctionType, opts.direction, opts.allergen, opts.target, opts.status ?? "pending"],
  );
}

before(async () => {
  await pool.query(
    `INSERT INTO users (id, email, password_hash, display_name, age_attested_adult, age_attested_at) VALUES
       ($1, 'accuracy-test-a@example.com', 'x', 'A', true, now())`,
    [USER_A],
  );
  await pool.query("INSERT INTO allergen_profiles (id, manager_id, label) VALUES ($1, $2, 'Test Profile')", [
    PROFILE_ID,
    USER_A,
  ]);
});

after(async () => {
  await pool.query("DELETE FROM users WHERE id = ANY($1)", [[USER_A]]);
  await pool.end();
});

test("aiAccuracyReport: an ai_verdict/remove_caution correction overrules the matching escalation", async () => {
  const scanId = await makeScan("9000000000001", [
    { allergenName: "Peanut", severity: "severe", classification: "contains", aiEscalated: true },
  ]);
  await makeVerdictExplanation(scanId, { model: "report-test-model", promptVersion: "report-test-v1" });
  await makeCorrection(scanId, "9000000000001", {
    correctionType: "flag_wrong",
    direction: "remove_caution",
    allergen: "Peanut",
    target: "ai_verdict",
  });

  const report = await aiAccuracyReport();
  const row = report.byModelPromptVersion.find((r) => r.model === "report-test-model");
  assert.ok(row);
  assert.equal(row!.escalation.escalations, 1);
  assert.equal(row!.escalation.overruled, 1);
});

test("aiAccuracyReport: a rejected correction does not count as an overrule", async () => {
  const scanId = await makeScan("9000000000002", [
    { allergenName: "Egg", severity: "moderate", classification: "contains", aiEscalated: true },
  ]);
  await makeVerdictExplanation(scanId, { model: "report-test-model-2" });
  await makeCorrection(scanId, "9000000000002", {
    correctionType: "flag_wrong",
    direction: "remove_caution",
    allergen: "Egg",
    target: "ai_verdict",
    status: "rejected",
  });

  const report = await aiAccuracyReport();
  const row = report.byModelPromptVersion.find((r) => r.model === "report-test-model-2");
  assert.equal(row!.escalation.overruled, 0);
});

test("aiAccuracyReport: a flag_missing (add_caution) correction never counts as an overrule", async () => {
  const scanId = await makeScan("9000000000003", [
    { allergenName: "Soy", severity: "mild", classification: "unresolved", aiEscalated: true },
  ]);
  await makeVerdictExplanation(scanId, { model: "report-test-model-3" });
  await makeCorrection(scanId, "9000000000003", {
    correctionType: "flag_missing",
    direction: "add_caution",
    allergen: "Soy",
    target: "ai_verdict",
  });

  const report = await aiAccuracyReport();
  const row = report.byModelPromptVersion.find((r) => r.model === "report-test-model-3");
  assert.equal(row!.unresolved.escalations, 1);
  assert.equal(row!.unresolved.overruled, 0);
});

test("aiAccuracyReport: misses count a flag_missing/off_data correction on an AI-reviewed scan", async () => {
  const scanId = await makeScan("9000000000004", [
    { allergenName: "Sesame", severity: "severe", classification: "clear", aiEscalated: false },
  ]);
  await makeVerdictExplanation(scanId, { model: "report-test-model-4" });
  await makeCorrection(scanId, "9000000000004", {
    correctionType: "flag_missing",
    direction: "add_caution",
    allergen: "Sesame",
    target: "off_data",
  });

  const before = await aiAccuracyReport();
  assert.ok(before.misses.reportedMisses >= 1);
  assert.ok(before.misses.aiReviewedScans >= 1);
});

test("aiAccuracyReport: failures are counted and broken down by reason", async () => {
  const scanId = await makeScan("9000000000005", []);
  await makeVerdictExplanation(scanId, { model: "report-test-model-5", failureReason: "spend_cap_exceeded" });

  const report = await aiAccuracyReport();
  assert.ok(report.failures.totalAttempts >= 1);
  assert.ok(report.failures.totalFailures >= 1);
  const reasonRow = report.failures.byReason.find((r) => r.reason === "spend_cap_exceeded");
  assert.ok(reasonRow && reasonRow.count >= 1);
});
