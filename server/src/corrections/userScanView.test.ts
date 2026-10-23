import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import { pool } from "../db/pool.js";
import { env } from "../env.js";
import { recordCorrection } from "./recordCorrection.js";
import { rejectCorrection } from "./reviewQueue.js";
import { loadUserScanViews, publicCommunityReports, type ScanForView } from "./userScanView.js";

// Real Postgres, same discipline as recordCorrection.test.ts: real inserts, real cleanup. This is
// the sequence both scan history and the live card's post-report refresh go through, so it's tested
// end to end from recordCorrection rather than with hand-built correction rows.

const REPORTER = "aaaaaaaa-0000-0000-0000-0000000000a1";
const OTHER = "aaaaaaaa-0000-0000-0000-0000000000a2";
const REPORTER_PROFILE = "bbbbbbbb-0000-0000-0000-0000000000a1";
const OTHER_PROFILE = "bbbbbbbb-0000-0000-0000-0000000000a2";
// A second reporting family, and a co-manager of REPORTER_PROFILE — the reporter's own family.
const SECOND_FAMILY = "aaaaaaaa-0000-0000-0000-0000000000a3";
const SECOND_FAMILY_PROFILE = "bbbbbbbb-0000-0000-0000-0000000000a3";
const CO_MANAGER = "aaaaaaaa-0000-0000-0000-0000000000a4";
// The reporter's second child — same family, a different circle (circle escalations are per profile).
const SIBLING_PROFILE = "bbbbbbbb-0000-0000-0000-0000000000a6";
// A milk-allergic child's owner, for the held-removal case.
const MILK_PARENT = "aaaaaaaa-0000-0000-0000-0000000000a5";
const MILK_PROFILE = "bbbbbbbb-0000-0000-0000-0000000000a5";

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
       ($2, 'view-test-b@example.com', 'x', 'B', true, now()),
       ($3, 'view-test-c@example.com', 'x', 'C', true, now()),
       ($4, 'view-test-d@example.com', 'x', 'D', true, now()),
       ($5, 'view-test-e@example.com', 'x', 'E', true, now())`,
    [REPORTER, OTHER, SECOND_FAMILY, CO_MANAGER, MILK_PARENT],
  );
  await pool.query(
    `INSERT INTO allergen_profiles (id, manager_id, label) VALUES ($1, $2, 'Test A'), ($3, $4, 'Test B'), ($5, $6, 'Test C')`,
    [REPORTER_PROFILE, REPORTER, OTHER_PROFILE, OTHER, SECOND_FAMILY_PROFILE, SECOND_FAMILY],
  );
  await pool.query(
    `INSERT INTO allergens (allergen_profile_id, name, severity, treat_traces_as_unsafe)
     VALUES ($1, 'Sesame', 'severe', false), ($2, 'Sesame', 'severe', false), ($3, 'Sesame', 'severe', false)`,
    [REPORTER_PROFILE, OTHER_PROFILE, SECOND_FAMILY_PROFILE],
  );
  await pool.query("INSERT INTO allergen_profiles (id, manager_id, label) VALUES ($1, $2, 'Test E')", [MILK_PROFILE, MILK_PARENT]);
  await pool.query("INSERT INTO allergen_profiles (id, manager_id, label) VALUES ($1, $2, 'Test A sibling')", [SIBLING_PROFILE, REPORTER]);
  await pool.query("INSERT INTO allergens (allergen_profile_id, name, severity, treat_traces_as_unsafe) VALUES ($1, 'Sesame', 'severe', false)", [
    SIBLING_PROFILE,
  ]);
  await pool.query("INSERT INTO allergens (allergen_profile_id, name, severity, treat_traces_as_unsafe) VALUES ($1, 'Milk', 'severe', true)", [
    MILK_PROFILE,
  ]);
  await pool.query("INSERT INTO profile_managers (allergen_profile_id, user_id, added_by) VALUES ($1, $2, $3)", [
    REPORTER_PROFILE,
    CO_MANAGER,
    REPORTER,
  ]);
});

after(async () => {
  // Corrections first — scan_id is ON DELETE SET NULL, see recordCorrection.test.ts's after().
  await pool.query(
    "DELETE FROM product_corrections WHERE scan_id IN (SELECT id FROM scans WHERE allergen_profile_id = ANY($1))",
    [[REPORTER_PROFILE, OTHER_PROFILE, SECOND_FAMILY_PROFILE, MILK_PROFILE, SIBLING_PROFILE]],
  );
  await pool.query("DELETE FROM users WHERE id = ANY($1)", [[REPORTER, OTHER, SECOND_FAMILY, CO_MANAGER, MILK_PARENT]]);
  await pool.end();
});

test("no corrections and no community reports: effective is null, so no transparency note renders", async () => {
  const scan = await makeScan(REPORTER_PROFILE, "7000000000001", "safe");
  const view = (await loadUserScanViews([scan], REPORTER_PROFILE, REPORTER)).get(scan.id)!;
  assert.equal(view.effective, null);
  assert.deepEqual(view.corrections, []);
  assert.deepEqual(view.communityApplied, []);
});

test("the reporter's own add_caution flips their view to contains_allergen straight after reporting", async () => {
  // The 2026-09-29 live test: A scanned Safe, reported sesame missing — A's card must now say so.
  const scan = await makeScan(REPORTER_PROFILE, "7000000000002", "safe");
  await report(scan.id, REPORTER, "flag_missing", "Sesame");

  const view = (await loadUserScanViews([scan], REPORTER_PROFILE, REPORTER)).get(scan.id)!;
  assert.equal(view.effective?.result, "contains_allergen");
  assert.equal(view.effective?.matchedAllergens.find((m) => m.allergenName === "Sesame")?.classification, "contains");
  assert.equal(view.corrections.length, 1);
  assert.equal(view.corrections[0].correctionType, "flag_missing");
  // One family can't corroborate an addition (threshold 2) — and their own card doesn't wait for it.
  assert.equal(view.corrections[0].status, "pending");
  // The original is untouched — the caller ships it alongside.
  assert.equal(scan.result, "safe");
});

test("the reporter's own remove_caution changes only their view, even though it can't corroborate alone", async () => {
  const scan = await makeScan(REPORTER_PROFILE, "7000000000003", "contains_allergen", [
    { allergenName: "Sesame", severity: "severe", classification: "contains" },
  ]);
  await report(scan.id, REPORTER, "flag_wrong", "Sesame");

  const mine = (await loadUserScanViews([scan], REPORTER_PROFILE, REPORTER)).get(scan.id)!;
  // Noted on their row, never applied (principle 6 as amended 2026-10-23): never "safe".
  assert.equal(mine.effective?.result, "contains_allergen");
  assert.equal(mine.effective?.matchedAllergens[0].disputedByYou, "pending");
  assert.equal(mine.corrections[0].status, "pending");

  // Someone else can't see the reporter's corrections on a scan — only their own.
  const theirs = (await loadUserScanViews([scan], REPORTER_PROFILE, OTHER)).get(scan.id)!;
  assert.equal(theirs.effective, null);
  assert.deepEqual(theirs.corrections, []);
});

test("community additions reach another profile only with the switch on, and apply on top of that user's own view", async () => {
  const reported = await makeScan(REPORTER_PROFILE, "7000000000004", "safe");
  await report(reported.id, REPORTER, "flag_missing", "Sesame");
  await report((await makeScan(SECOND_FAMILY_PROFILE, "7000000000004", "safe")).id, SECOND_FAMILY, "flag_missing", "Sesame");
  const othersScan = await makeScan(OTHER_PROFILE, "7000000000004", "safe");

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

test("an owner and a co-manager of the same child are one family: their addition reaches no other profile", async () => {
  const barcode = "7000000000006";
  await report((await makeScan(REPORTER_PROFILE, barcode, "safe")).id, REPORTER, "flag_missing", "Sesame");
  const coManagers = await report((await makeScan(REPORTER_PROFILE, barcode, "safe")).id, CO_MANAGER, "flag_missing", "Sesame");
  assert.equal(coManagers.corroborated, false, "two reporters, one family");

  const othersScan = await makeScan(OTHER_PROFILE, barcode, "safe");
  const previous = env.communityCorrections;
  try {
    env.communityCorrections = true;
    const theirs = (await loadUserScanViews([othersScan], OTHER_PROFILE, OTHER)).get(othersScan.id)!;
    assert.equal(theirs.effective, null);
  } finally {
    env.communityCorrections = previous;
  }
});

test("a barcode-less scan in the batch doesn't break the community lookup for the others", async () => {
  const previous = env.communityCorrections;
  try {
    env.communityCorrections = true;
    const noBarcode = await makeScan(REPORTER_PROFILE, null, "safe");
    const withBarcode = await makeScan(REPORTER_PROFILE, "7000000000005", "safe");
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
  const removed = await makeScan(REPORTER_PROFILE, "7000000000006", "contains_allergen", [
    { allergenName: "Sesame", severity: "severe", classification: "contains" },
  ]);
  const removal = await report(removed.id, REPORTER, "flag_wrong", "Sesame");
  await rejectCorrection(removal.id, OTHER, null);

  const afterRemovalRejected = (await loadUserScanViews([removed], REPORTER_PROFILE, REPORTER)).get(removed.id)!;
  assert.equal(afterRemovalRejected.effective, null, "the engine's own contains_allergen shows again");
  assert.equal(afterRemovalRejected.corrections[0].status, "rejected", "the report itself is still listed");

  const added = await makeScan(REPORTER_PROFILE, "7000000000007", "safe");
  const addition = await report(added.id, REPORTER, "flag_missing", "Sesame");
  await rejectCorrection(addition.id, OTHER, "label photo shows no sesame");

  const afterAdditionRejected = (await loadUserScanViews([added], REPORTER_PROFILE, REPORTER)).get(added.id)!;
  assert.equal(afterAdditionRejected.effective?.result, "contains_allergen");
});

test("a Milk removal under two families' confirmed Whey reports is held: the parent sees Milk confirmed, never whey", async () => {
  const barcode = "7000000000007";
  for (const [user, profile] of [[OTHER, OTHER_PROFILE], [SECOND_FAMILY, SECOND_FAMILY_PROFILE]]) {
    await report((await makeScan(profile, barcode, "safe", [])).id, user, "flag_missing", "Whey");
  }
  const containsMilk = [{ allergenName: "Milk", severity: "severe", classification: "contains" }];
  const scan = await makeScan(MILK_PROFILE, barcode, "contains_allergen", containsMilk);
  const removal = await report(scan.id, MILK_PARENT, "flag_wrong", "Milk");
  assert.equal(removal.status, "pending");

  const previous = env.communityCorrections;
  try {
    env.communityCorrections = true;
    const view = (await loadUserScanViews([scan], MILK_PROFILE, MILK_PARENT)).get(scan.id)!;
    // The confirmed warning outranks the removal on the parent's own card...
    assert.equal(view.effective?.result, "contains_allergen");
    assert.equal(view.corrections[0].status, "pending");
    // ...and is named in the parent's own vocabulary: Milk, the profile's name. What reaches the
    // client is publicCommunityReports — allergenName and reporterCount, no spellings.
    assert.deepEqual(publicCommunityReports(view.communityApplied), [{ allergenName: "Milk", reporterCount: 2 }]);
    assert.doesNotMatch(JSON.stringify(publicCommunityReports(view.communityApplied)), /whey/i);
  } finally {
    env.communityCorrections = previous;
  }
});

// Shared pending escalations (circleEscalations.ts; JT 2026-10-13, Prof. Yoest's ask of 2026-10-14).
// REPORTER owns REPORTER_PROFILE and CO_MANAGER co-manages it: the parent and the grandparent.

async function withCircleEscalations<T>(on: boolean, run: () => Promise<T>): Promise<T> {
  const previous = env.circleEscalations;
  env.circleEscalations = on;
  try {
    return await run();
  } finally {
    env.circleEscalations = previous;
  }
}

test("a co-manager's pending escalation is visible to the child's parent", async () => {
  const scan = await makeScan(REPORTER_PROFILE, "7100000000001", "safe");
  const filed = await report(scan.id, CO_MANAGER, "flag_missing", "Sesame");
  assert.equal(filed.status, "pending", "one family: not corroborated");

  const before = await withCircleEscalations(false, async () =>
    (await loadUserScanViews([scan], REPORTER_PROFILE, REPORTER)).get(scan.id)!,
  );
  assert.equal(before.effective, null, "switch off: only the reporter sees it, as before");

  const parents = await withCircleEscalations(true, async () =>
    (await loadUserScanViews([scan], REPORTER_PROFILE, REPORTER)).get(scan.id)!,
  );
  assert.equal(parents.effective?.result, "contains_allergen");
  const sesame = parents.effective?.matchedAllergens.find((m) => m.allergenName === "Sesame");
  assert.equal(sesame?.classification, "contains");
  assert.equal(sesame?.circleReported, true, "marked as a circle report, so the card can say so");
  assert.deepEqual(parents.circleApplied, [
    { allergenName: "Sesame", reporters: [{ name: "D", role: "co_manager", isViewer: false }] },
  ]);
  assert.deepEqual(parents.communityApplied, [], "not a community report — nobody else has confirmed it");
  assert.deepEqual(parents.corrections, [], "the parent's own corrections list stays theirs");
});

test("a circle's pending escalation persists onto every scan of the barcode, even after its own scan is deleted", async () => {
  const barcode = "7100000000002";
  const grandparentsScan = await makeScan(REPORTER_PROFILE, barcode, "safe");
  const filed = await report(grandparentsScan.id, CO_MANAGER, "flag_missing", "Sesame");
  const parentsLaterScan = await makeScan(REPORTER_PROFILE, barcode, "safe");
  await pool.query("DELETE FROM scans WHERE id = $1", [grandparentsScan.id]);

  try {
    await withCircleEscalations(true, async () => {
      const parents = (await loadUserScanViews([parentsLaterScan], REPORTER_PROFILE, REPORTER)).get(parentsLaterScan.id)!;
      assert.equal(parents.effective?.result, "contains_allergen");
      assert.equal(parents.circleApplied[0]?.allergenName, "Sesame");

      // The grandparent's own later scan says it was theirs.
      const theirs = (await loadUserScanViews([parentsLaterScan], REPORTER_PROFILE, CO_MANAGER)).get(parentsLaterScan.id)!;
      assert.deepEqual(theirs.circleApplied[0]?.reporters, [{ name: "D", role: "co_manager", isViewer: true }]);
    });
  } finally {
    // after() finds corrections through their scans; this one no longer has one.
    await pool.query("DELETE FROM product_corrections WHERE id = $1", [filed.id]);
  }
});

test("a co-manager's pending removal stays with them: the parent still sees the warning", async () => {
  const scan = await makeScan(REPORTER_PROFILE, "7100000000003", "contains_allergen", [
    { allergenName: "Sesame", severity: "severe", classification: "contains" },
  ]);
  await report(scan.id, CO_MANAGER, "flag_wrong", "Sesame");

  await withCircleEscalations(true, async () => {
    const parents = (await loadUserScanViews([scan], REPORTER_PROFILE, REPORTER)).get(scan.id)!;
    assert.equal(parents.effective, null, "the engine's contains_allergen, unchanged");
    assert.deepEqual(parents.circleApplied, []);

    const theirs = (await loadUserScanViews([scan], REPORTER_PROFILE, CO_MANAGER)).get(scan.id)!;
    assert.equal(theirs.effective?.result, "contains_allergen", "the reporter's own view: noted, not lowered");
    assert.equal(theirs.effective?.matchedAllergens[0].disputedByYou, "pending");
  });
});

test("a pending escalation reaches neither another family's profile nor the same owner's other child", async () => {
  const barcode = "7100000000004";
  await report((await makeScan(REPORTER_PROFILE, barcode, "safe")).id, CO_MANAGER, "flag_missing", "Sesame");
  const siblingsScan = await makeScan(SIBLING_PROFILE, barcode, "safe");
  const othersScan = await makeScan(OTHER_PROFILE, barcode, "safe");

  await withCircleEscalations(true, async () => {
    const sibling = (await loadUserScanViews([siblingsScan], SIBLING_PROFILE, REPORTER)).get(siblingsScan.id)!;
    assert.equal(sibling.effective, null, "one owner, but a different child's circle");
    const other = (await loadUserScanViews([othersScan], OTHER_PROFILE, OTHER)).get(othersScan.id)!;
    assert.equal(other.effective, null);
  });
});

test("a rejected escalation stops being shared; a corroborated one shows as confirmed, not as one circle's report", async () => {
  const rejectedBarcode = "7100000000005";
  const rejected = await report((await makeScan(REPORTER_PROFILE, rejectedBarcode, "safe")).id, CO_MANAGER, "flag_missing", "Sesame");
  await rejectCorrection(rejected.id, OTHER, "label photo shows no sesame");
  const parentsRejectedScan = await makeScan(REPORTER_PROFILE, rejectedBarcode, "safe");

  const confirmedBarcode = "7100000000006";
  await report((await makeScan(REPORTER_PROFILE, confirmedBarcode, "safe")).id, CO_MANAGER, "flag_missing", "Sesame");
  await report((await makeScan(SECOND_FAMILY_PROFILE, confirmedBarcode, "safe")).id, SECOND_FAMILY, "flag_missing", "Sesame");
  const parentsConfirmedScan = await makeScan(REPORTER_PROFILE, confirmedBarcode, "safe");

  const previous = env.communityCorrections;
  try {
    env.communityCorrections = true;
    await withCircleEscalations(true, async () => {
      const views = await loadUserScanViews([parentsRejectedScan, parentsConfirmedScan], REPORTER_PROFILE, REPORTER);
      assert.equal(views.get(parentsRejectedScan.id)!.effective, null);

      const confirmed = views.get(parentsConfirmedScan.id)!;
      assert.equal(confirmed.effective?.result, "contains_allergen");
      assert.equal(confirmed.communityApplied[0]?.reporterCount, 2);
      assert.deepEqual(confirmed.circleApplied, [], "not also called one family's unconfirmed report");
    });
  } finally {
    env.communityCorrections = previous;
  }
});
