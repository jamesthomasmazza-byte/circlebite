import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import { recordCorrection } from "../corrections/recordCorrection.js";
import { pool } from "../db/pool.js";
import { env } from "../env.js";
import { scansRouter } from "./scans.js";

// No HTTP harness in this codebase (see scansLabel.test.ts) — this invokes GET /profiles/:id/scans's
// main handler directly, past requireAuth, with a fake req carrying the user it would have attached.
// The access check, the views and the severe_only filtering all run for real against Postgres.

const OWNER = "aaaaaaaa-0000-0000-0000-0000000000d1";
const CO_MANAGER = "aaaaaaaa-0000-0000-0000-0000000000d2";
const SEVERE_ONLY_FOLLOWER = "aaaaaaaa-0000-0000-0000-0000000000d3";
const FULL_FOLLOWER = "aaaaaaaa-0000-0000-0000-0000000000d4";
const PROFILE_ID = "bbbbbbbb-0000-0000-0000-0000000000d1";

type HistoryEntry = {
  id: string;
  effective: { result: string; matched_allergens: { allergenName: string }[] } | null;
  pending_circle_reports: { allergenName: string }[];
};

function getHistory(userId: string): Promise<HistoryEntry[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const layer = (scansRouter as any).stack.find(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (l: any) => l.route?.path === "/profiles/:id/scans" && l.route.methods.get,
  );
  assert.ok(layer, "expected a registered GET /profiles/:id/scans route");
  const handler = layer.route.stack.at(-1).handle;

  return new Promise((resolve, reject) => {
    const res = {
      status() {
        return res;
      },
      json(payload: HistoryEntry[]) {
        resolve(payload);
      },
    };
    handler({ params: { id: PROFILE_ID }, user: { id: userId } }, res, (err: unknown) =>
      reject(err ?? new Error("handler called next() without responding")),
    );
  });
}

async function coManagerReports(barcode: string, allergen: string): Promise<string> {
  const matched = [
    { allergenName: "Peanut", severity: "severe", classification: "clear" },
    { allergenName: "Egg", severity: "mild", classification: "clear" },
  ];
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO scans (allergen_profile_id, barcode, result, matched_allergens, ingredients_text)
     VALUES ($1, $2, 'safe', $3, 'test ingredients') RETURNING id`,
    [PROFILE_ID, barcode, JSON.stringify(matched)],
  );
  await recordCorrection({
    scanId: rows[0].id,
    reportedBy: CO_MANAGER,
    correctionType: "flag_missing",
    allergen,
    note: null,
    photoPath: "/fake.jpg",
    origin: "user_initiated",
  });
  return rows[0].id;
}

before(async () => {
  await pool.query(
    `INSERT INTO users (id, email, password_hash, display_name, age_attested_adult, age_attested_at) VALUES
       ($1, 'history-owner@example.com', 'x', 'Owner', true, now()),
       ($2, 'history-comanager@example.com', 'x', 'Grandma', true, now()),
       ($3, 'history-severe-follower@example.com', 'x', 'Sitter', true, now()),
       ($4, 'history-full-follower@example.com', 'x', 'Aunt', true, now())`,
    [OWNER, CO_MANAGER, SEVERE_ONLY_FOLLOWER, FULL_FOLLOWER],
  );
  await pool.query("INSERT INTO allergen_profiles (id, manager_id, label) VALUES ($1, $2, 'History test')", [PROFILE_ID, OWNER]);
  await pool.query(
    `INSERT INTO allergens (allergen_profile_id, name, severity, treat_traces_as_unsafe)
     VALUES ($1, 'Peanut', 'severe', true), ($1, 'Egg', 'mild', true)`,
    [PROFILE_ID],
  );
  await pool.query("INSERT INTO profile_managers (allergen_profile_id, user_id, added_by) VALUES ($1, $2, $3)", [
    PROFILE_ID,
    CO_MANAGER,
    OWNER,
  ]);
  await pool.query(
    `INSERT INTO follow_relationships (allergen_profile_id, follower_id, invited_by, token_hash, status, share_level, responded_at)
     VALUES ($1, $2, $4, 'history-test-token-severe', 'accepted', 'severe_only', now()),
            ($1, $3, $4, 'history-test-token-all', 'accepted', 'all', now())`,
    [PROFILE_ID, SEVERE_ONLY_FOLLOWER, FULL_FOLLOWER, OWNER],
  );
});

after(async () => {
  await pool.query("DELETE FROM product_corrections WHERE scan_id IN (SELECT id FROM scans WHERE allergen_profile_id = $1)", [PROFILE_ID]);
  await pool.query("DELETE FROM users WHERE id = ANY($1)", [[OWNER, CO_MANAGER, SEVERE_ONLY_FOLLOWER, FULL_FOLLOWER]]);
  await pool.end();
});

test("a severe_only follower's history never names a mild allergen from a circle report", async () => {
  const mildScan = await coManagerReports("7200000000001", "Egg");
  const severeScan = await coManagerReports("7200000000002", "Peanut");

  const previous = env.circleEscalations;
  try {
    env.circleEscalations = true;

    const severeOnly = await getHistory(SEVERE_ONLY_FOLLOWER);
    const mild = severeOnly.find((s) => s.id === mildScan)!;
    assert.deepEqual(mild.pending_circle_reports, [], "the mild allergen's report isn't named");
    assert.deepEqual(
      mild.effective?.matched_allergens.map((m) => m.allergenName),
      ["Peanut"],
      "nor listed — only the severe allergen is",
    );
    // Still never silent: the verdict changed, and the card says a report it can't show did it.
    assert.equal(mild.effective?.result, "contains_allergen");
    const severe = severeOnly.find((s) => s.id === severeScan)!;
    assert.deepEqual(
      severe.pending_circle_reports.map((r) => r.allergenName),
      ["Peanut"],
    );

    const full = await getHistory(FULL_FOLLOWER);
    assert.deepEqual(
      full.find((s) => s.id === mildScan)!.pending_circle_reports.map((r) => r.allergenName),
      ["Egg"],
      "a follower on the full tier sees it",
    );
  } finally {
    env.circleEscalations = previous;
  }
});
