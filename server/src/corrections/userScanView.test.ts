import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import { pool } from "../db/pool.js";
import { env } from "../env.js";
import { recordCorrection } from "./recordCorrection.js";
import { rejectCorrection } from "./reviewQueue.js";
import { loadUserScanViews, type ScanForView } from "./userScanView.js";

// Real Postgres, same discipline as recordCorrection.test.ts: real inserts, real cleanup. This is
// the sequence both scan history and the live card's post-report refresh go through, so it's tested
// end to end from recordCorrection rather than with hand-built correction rows.

const REPORTER = "aaaaaaaa-0000-0000-0000-0000000000a1";
const OTHER = "aaaaaaaa-0000-0000-0000-0000000000a2";
const REPORTER_PROFILE = "bbbbbbbb-0000-0000-0000-0000000000a1";
const OTHER_PROFILE = "bbbbbbbb-0000-0000-0000-0000000000a2";

const SAFE_SESAME = [{ allergenName: "Sesame", severity: "severe", classification: "clear" }];

async function makeScan(profileId: string, barcode: string | null, result: string, matched = SAFE_SESAME): Promise<ScanForView> {
  const { rows } = await pool.query<ScanForView>(
    `INSERT INTO scans (allergen_profile_id, barcode, result, matched_allergens, ingredients_text)
     VALUES ($1, $2, $3, $4, 'test ingredients') RETURNING id, barcode, result, matched_allergens`,
    [profileId, barcode, result, JSON.stringify(matched)],
  );
  return rows[0];
}

function report(scanId: string, reportedBy: string, correctionType: "flag_missing" | "flag_wrong", allergen: string) {
  return recordCorrection({ scanId, reportedBy, correctionType, allergen, note: null, photoPath: "/fake.jpg", origin: "user_initiated" });
}

before(async () => {
  await pool.query(
    `INSERT INTO users (id, email, password_hash, display_name, age_attested_adult, age_attested_at) VALUES
       ($1, 'view-test-a@example.com', 'x', 'A', true, now()),
       ($2, 'view-test-b@example.com', 'x', 'B', true, now())`,
    [REPORTER, OTHER],
  );
  await pool.query(
    `INSERT INTO allergen_profiles (id, manager_id, label) VALUES ($1, $2, 'Test A'), ($3, $4, 'Test B')`,
    [REPORTER_PROFILE, REPORTER, OTHER_PROFILE, OTHER],
  );
  await pool.query(
    `INSERT INTO allergens (allergen_profile_id, name, severity, treat_traces_as_unsafe)
     VALUES ($1, 'Sesame', 'severe', false), ($2, 'Sesame', 'severe', false)`,
    [REPORTER_PROFILE, OTHER_PROFILE],
  );
});

after(async () => {
  // Corrections first — scan_id is ON DELETE SET NULL, see recordCorrection.test.ts's after().
  await pool.query(
    "DELETE FROM product_corrections WHERE scan_id IN (SELECT id FROM scans WHERE allergen_profile_id = ANY($1))",
    [[REPORTER_PROFILE, OTHER_PROFILE]],
  );
  await pool.query("DELETE FROM users WHERE id = ANY($1)", [[REPORTER, OTHER]]);
  await pool.end();
});

test("no corrections and no community reports: effective is null, so no transparency note renders", async () => {
  const scan = await makeScan(REPORTER_PROFILE, "3000000000001", "safe");
  const view = (await loadUserScanViews([scan], REPORTER_PROFILE, REPORTER)).get(scan.id)!;
  assert.equal(view.effective, null);
  assert.deepEqual(view.corrections, []);
  assert.deepEqual(view.communityApplied, []);
});

test("the reporter's own add_caution flips their view to contains_allergen straight after reporting", async () => {
  // The 2026-09-29 live test: A scanned Safe, reported sesame missing — A's card must now say so.
  const scan = await makeScan(REPORTER_PROFILE, "3000000000002", "safe");
  await report(scan.id, REPORTER, "flag_missing", "Sesame");

  const view = (await loadUserScanViews([scan], REPORTER_PROFILE, REPORTER)).get(scan.id)!;
  assert.equal(view.effective?.result, "contains_allergen");
  assert.equal(view.effective?.matchedAllergens.find((m) => m.allergenName === "Sesame")?.classification, "contains");
  assert.equal(view.corrections.length, 1);
  assert.equal(view.corrections[0].correctionType, "flag_missing");
  assert.equal(view.corrections[0].status, "corroborated");
  // The original is untouched — the caller ships it alongside.
  assert.equal(scan.result, "safe");
});

test("the reporter's own remove_caution changes only their view, even though it can't corroborate alone", async () => {
  const scan = await makeScan(REPORTER_PROFILE, "3000000000003", "contains_allergen", [
    { allergenName: "Sesame", severity: "severe", classification: "contains" },
  ]);
  await report(scan.id, REPORTER, "flag_wrong", "Sesame");

  const mine = (await loadUserScanViews([scan], REPORTER_PROFILE, REPORTER)).get(scan.id)!;
  assert.equal(mine.effective?.result, "safe");
  assert.equal(mine.corrections[0].status, "pending");

  // Someone else can't see the reporter's corrections on a scan — only their own.
  const theirs = (await loadUserScanViews([scan], REPORTER_PROFILE, OTHER)).get(scan.id)!;
  assert.equal(theirs.effective, null);
  assert.deepEqual(theirs.corrections, []);
});

test("community additions reach another profile only with the switch on, and apply on top of that user's own view", async () => {
  const reported = await makeScan(REPORTER_PROFILE, "3000000000004", "safe");
  await report(reported.id, REPORTER, "flag_missing", "Sesame");
  const othersScan = await makeScan(OTHER_PROFILE, "3000000000004", "safe");

  const previous = env.communityCorrections;
  try {
    env.communityCorrections = false;
    const off = (await loadUserScanViews([othersScan], OTHER_PROFILE, OTHER)).get(othersScan.id)!;
    assert.equal(off.effective, null);

    env.communityCorrections = true;
    const on = (await loadUserScanViews([othersScan], OTHER_PROFILE, OTHER)).get(othersScan.id)!;
    assert.equal(on.effective?.result, "contains_allergen");
    assert.deepEqual(on.corrections, []);
    assert.equal(on.communityApplied.length, 1);
    assert.equal(on.communityApplied[0].allergenName, "Sesame");

    // The reporter's own scan: their own correction already made Sesame "contains", so the
    // community layer has nothing to add and doesn't claim the change as a shopper report.
    const mine = (await loadUserScanViews([reported], REPORTER_PROFILE, REPORTER)).get(reported.id)!;
    assert.equal(mine.effective?.result, "contains_allergen");
    assert.deepEqual(mine.communityApplied, []);
  } finally {
    env.communityCorrections = previous;
  }
});

test("a barcode-less scan in the batch doesn't break the community lookup for the others", async () => {
  const previous = env.communityCorrections;
  try {
    env.communityCorrections = true;
    const noBarcode = await makeScan(REPORTER_PROFILE, null, "safe");
    const withBarcode = await makeScan(REPORTER_PROFILE, "3000000000005", "safe");
    const views = await loadUserScanViews([noBarcode, withBarcode], REPORTER_PROFILE, REPORTER);
    assert.equal(views.get(noBarcode.id)!.effective, null);
    assert.equal(views.get(withBarcode.id)!.effective, null);
  } finally {
    env.communityCorrections = previous;
  }
});

test("after an admin rejects it, a removal stops clearing the reporter's view; an addition keeps warning it", async () => {
  // docs/principles.md principle 1, decided 2026-09-29. OTHER stands in for the admin here —
  // rejectCorrection records who rejected, it doesn't check is_admin (the route does).
  const removed = await makeScan(REPORTER_PROFILE, "3000000000006", "contains_allergen", [
    { allergenName: "Sesame", severity: "severe", classification: "contains" },
  ]);
  const removal = await report(removed.id, REPORTER, "flag_wrong", "Sesame");
  await rejectCorrection(removal.id, OTHER, null);

  const afterRemovalRejected = (await loadUserScanViews([removed], REPORTER_PROFILE, REPORTER)).get(removed.id)!;
  assert.equal(afterRemovalRejected.effective, null, "the engine's own contains_allergen shows again");
  assert.equal(afterRemovalRejected.corrections[0].status, "rejected", "the report itself is still listed");

  const added = await makeScan(REPORTER_PROFILE, "3000000000007", "safe");
  const addition = await report(added.id, REPORTER, "flag_missing", "Sesame");
  await rejectCorrection(addition.id, OTHER, "label photo shows no sesame");

  const afterAdditionRejected = (await loadUserScanViews([added], REPORTER_PROFILE, REPORTER)).get(added.id)!;
  assert.equal(afterAdditionRejected.effective?.result, "contains_allergen");
});
