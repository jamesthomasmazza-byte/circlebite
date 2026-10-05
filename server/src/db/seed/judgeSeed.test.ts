import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { rm } from "node:fs/promises";
import path from "node:path";
import { after, before, test } from "node:test";

import { deleteAccount } from "../../account/deleteAccount.js";
import { hashPassword, verifyPassword } from "../../auth/password.js";
import { getProfileAccess } from "../../authorization/profiles.js";
import { loadCommunityAdditions } from "../../corrections/communityAdditions.js";
import { env } from "../../env.js";
import { SEED_EMAIL_DOMAIN } from "../../lib/seedMarker.js";
import { scansRouter } from "../../routes/scans.js";
import { pool } from "../pool.js";
import { JUDGE_CORRECTION_REJECTION_REASON, runJudgeSeed, SeedConflictError } from "./judgeSeed.js";
import { COMMUNITY_REPORT, NPS_ROWS, PEOPLE, PRODUCTS, PROFILES, SCANS, SEED_BARCODES } from "./seedData.js";

// Real Postgres. This file owns the seed domain and the seed barcodes for the length of the run, so
// it clears any seed already on the local dev database — expected for a dev database.

// A non-seeded person, the way a real user or a test fixture looks: @example.com, a "7e57" id.
const OUTSIDER = "7e570000-0000-0000-0000-000000000001";
const OUTSIDER_PROFILE = "7e570000-0000-0000-0000-000000000002";
const OUTSIDER_SCAN = "7e570000-0000-0000-0000-000000000003";
const OUTSIDER_CORRECTION = "7e570000-0000-0000-0000-000000000004";
const OUTSIDER_NPS = "7e570000-0000-0000-0000-000000000005";
const JUDGE_TEST_SCAN = "7e570000-0000-0000-0000-000000000006";
const JUDGE_TEST_CORRECTION = "7e570000-0000-0000-0000-000000000007";
// Any barcode outside the seed set stands in for "a real product" here — this one isn't a real GTIN.
const STAND_IN_REAL_BARCODE = "1000000000095";

// Generated per run, never written down — the seed itself never sees a literal either (R8).
const judgePassword = randomBytes(18).toString("base64url");
let judgePasswordHash: string;
let otherPasswordHash: string;

function seed(force = false) {
  return runJudgeSeed({ judgePasswordHash, otherPasswordHash, force });
}

/** Removes every seed row, the way a never-seeded database looks. Test-only. */
async function clearSeed() {
  await pool.query("DELETE FROM product_corrections WHERE id = $1", [COMMUNITY_REPORT.id]);
  await pool.query("DELETE FROM nps_responses WHERE id = ANY($1)", [NPS_ROWS.map((r) => r.id)]);
  await pool.query("DELETE FROM users WHERE email LIKE $1", [`%@${SEED_EMAIL_DOMAIN}`]);
  await pool.query("DELETE FROM products WHERE barcode = ANY($1)", [SEED_BARCODES]);
}

/** Everything the seed owns, normalized — no timestamps or password hashes, which differ by design. */
async function snapshot() {
  const q = async (sql: string, params: unknown[] = []) => (await pool.query(sql, params)).rows;
  const users = await q("SELECT id, email, display_name, is_admin FROM users WHERE email LIKE $1 ORDER BY email", [
    `%@${SEED_EMAIL_DOMAIN}`,
  ]);
  const userIds = users.map((u) => u.id);
  return {
    users,
    profiles: await q("SELECT id, manager_id, label, is_self FROM allergen_profiles WHERE manager_id = ANY($1) ORDER BY id", [userIds]),
    allergens: await q(
      `SELECT a.id, a.allergen_profile_id, a.name, a.severity, a.treat_traces_as_unsafe FROM allergens a
       JOIN allergen_profiles p ON p.id = a.allergen_profile_id WHERE p.manager_id = ANY($1) ORDER BY a.id`,
      [userIds],
    ),
    coManagers: await q("SELECT id, allergen_profile_id, user_id, added_by FROM profile_managers WHERE user_id = ANY($1) ORDER BY id", [userIds]),
    followers: await q(
      "SELECT id, allergen_profile_id, follower_id, status, share_level FROM follow_relationships WHERE follower_id = ANY($1) ORDER BY id",
      [userIds],
    ),
    scans: await q(
      `SELECT s.id, s.allergen_profile_id, s.scanner_id, s.barcode, s.result, s.matched_allergens FROM scans s
       JOIN allergen_profiles p ON p.id = s.allergen_profile_id WHERE p.manager_id = ANY($1) ORDER BY s.id`,
      [userIds],
    ),
    report: await q("SELECT id, scan_id, barcode, reported_by, allergen, direction, status, photo_path FROM product_corrections WHERE id = $1", [
      COMMUNITY_REPORT.id,
    ]),
    nps: await q("SELECT id, user_id, score, reason, source FROM nps_responses WHERE id = ANY($1) ORDER BY id", [NPS_ROWS.map((r) => r.id)]),
    products: await q(
      "SELECT barcode, found, name, brand, ingredients_text, allergens_tags, traces_tags, raw_data FROM products WHERE barcode = ANY($1) ORDER BY barcode",
      [SEED_BARCODES],
    ),
  };
}

before(async () => {
  judgePasswordHash = await hashPassword(judgePassword);
  otherPasswordHash = await hashPassword(randomBytes(32).toString("base64url"));
  await clearSeed();
});

after(async () => {
  await pool.query("DELETE FROM product_corrections WHERE id = ANY($1)", [[OUTSIDER_CORRECTION, JUDGE_TEST_CORRECTION]]);
  await pool.query("DELETE FROM nps_responses WHERE id = $1", [OUTSIDER_NPS]);
  await pool.query("DELETE FROM users WHERE id = $1", [OUTSIDER]);
  await clearSeed();
  await rm(path.join(env.uploadDir, COMMUNITY_REPORT.photoPath), { force: true });
  await pool.end();
});

function gtinCheckDigit(first12: string): number {
  const sum = [...first12].reduce((acc, d, i) => acc + Number(d) * (i % 2 === 0 ? 1 : 3), 0);
  return (10 - (sum % 10)) % 10;
}

test("every seed barcode is a GTIN-13 with a deliberately invalid check digit — no real product can carry it", () => {
  for (const barcode of SEED_BARCODES) {
    assert.match(barcode, /^\d{13}$/, barcode);
    assert.notEqual(Number(barcode[12]), gtinCheckDigit(barcode.slice(0, 12)), barcode);
  }
});

let baseline: Awaited<ReturnType<typeof snapshot>>;

test("fresh seed: the judge can sign in and holds every circle role, with history across all four verdicts", async () => {
  await seed();
  baseline = await snapshot();

  const { rows: judgeRows } = await pool.query<{ password_hash: string; is_admin: boolean }>(
    "SELECT password_hash, is_admin FROM users WHERE id = $1",
    [PEOPLE.judge.id],
  );
  assert.equal(await verifyPassword(judgePassword, judgeRows[0].password_hash), true);
  assert.equal(judgeRows[0].is_admin, false, "the judge is not an admin (Sept 11 precedent)");

  assert.equal((await getProfileAccess(PEOPLE.judge.id, PROFILES.maya.id))?.level, "owner");
  assert.equal((await getProfileAccess(PEOPLE.judge.id, PROFILES.leo.id))?.level, "co_manager");
  assert.equal((await getProfileAccess(PEOPLE.judge.id, PROFILES.noor.id))?.level, "follower");

  // At least one severe allergen, and one treating traces as unsafe.
  assert.ok(baseline.allergens.some((a) => a.severity === "severe"));
  assert.ok(baseline.allergens.some((a) => a.treat_traces_as_unsafe === true));

  assert.deepEqual(
    new Set(baseline.scans.map((s) => s.result)),
    new Set(["safe", "contains_allergen", "may_contain_caution", "unable_to_confirm"]),
  );

  // No AI anywhere: no verdict_explanations, so nothing reaches the AI accuracy page.
  const { rows: explanations } = await pool.query("SELECT 1 FROM verdict_explanations WHERE scan_id = ANY($1)", [SCANS.map((s) => s.id)]);
  assert.equal(explanations.length, 0);

  // The seeded community report is live — for its own barcode only.
  const additions = await loadCommunityAdditions([PRODUCTS.reported.barcode]);
  assert.deepEqual(
    additions.get(PRODUCTS.reported.barcode)?.map((a) => a.allergen.toLowerCase()),
    ["peanut"],
  );

  assert.equal(baseline.nps.length, 24);
  assert.ok(baseline.nps.every((r) => r.source === "seed" && r.user_id === null));
});

test("reseeding over a seeded database ends in exactly the same state", async () => {
  await seed();
  assert.deepEqual(await snapshot(), baseline);
});

test("after the judge deletes their own account, Maya transfers to Priya — and a reseed restores everything", async () => {
  await deleteAccount(PEOPLE.judge.id);
  const { rows } = await pool.query<{ manager_id: string }>("SELECT manager_id FROM allergen_profiles WHERE id = $1", [PROFILES.maya.id]);
  assert.equal(rows[0].manager_id, PEOPLE.priya.id, "the co-managed profile survived, now Priya's (coppa.md §2.6)");

  await seed();
  assert.deepEqual(await snapshot(), baseline);
});

test("a correction the judge filed is rejected by a reseed, not deleted — and a second reseed leaves it alone", async () => {
  await pool.query(
    `INSERT INTO scans (id, scanner_id, allergen_profile_id, barcode, result, matched_allergens)
     VALUES ($1, $2, $3, $4, 'safe', '[]')`,
    [JUDGE_TEST_SCAN, PEOPLE.judge.id, PROFILES.maya.id, STAND_IN_REAL_BARCODE],
  );
  await pool.query(
    `INSERT INTO product_corrections
       (id, scan_id, barcode, reported_by, correction_type, direction, allergen, target, verdict_at_report, note, photo_path, status)
     VALUES ($1, $2, $3, $4, 'flag_missing', 'add_caution', 'Peanut', 'off_data', 'safe', 'judge testing', 'corrections/none.jpg', 'corroborated')`,
    [JUDGE_TEST_CORRECTION, JUDGE_TEST_SCAN, STAND_IN_REAL_BARCODE, PEOPLE.judge.id],
  );

  const summary = await seed();
  assert.equal(summary.judgeCorrectionsRejected, 1);

  const read = async () =>
    (await pool.query("SELECT barcode, allergen, note, status, rejected_by, rejected_at, rejection_reason FROM product_corrections WHERE id = $1", [
      JUDGE_TEST_CORRECTION,
    ])).rows[0];
  const first = await read();
  assert.ok(first, "the row survives — the overrule log stays intact");
  assert.equal(first.status, "rejected");
  assert.equal(first.rejected_by, null);
  assert.equal(first.rejection_reason, JUDGE_CORRECTION_REJECTION_REASON);
  assert.equal(first.barcode, STAND_IN_REAL_BARCODE);
  assert.equal(first.note, "judge testing");
  // No longer a live warning on that barcode.
  assert.equal((await loadCommunityAdditions([STAND_IN_REAL_BARCODE])).get(STAND_IN_REAL_BARCODE)?.length ?? 0, 0);

  await seed();
  assert.deepEqual(await read(), first, "already rejected: a second reseed doesn't touch it");
  assert.deepEqual(await snapshot(), baseline);
});

test("a non-seeded person's account, profile, scans, corrections and feedback are untouched by seeding", async () => {
  await pool.query(
    `INSERT INTO users (id, email, password_hash, display_name, age_attested_adult, age_attested_at)
     VALUES ($1, 'seed-outsider@example.com', 'x', 'Outsider', true, now())`,
    [OUTSIDER],
  );
  await pool.query("INSERT INTO allergen_profiles (id, manager_id, label) VALUES ($1, $2, 'Outsider child')", [OUTSIDER_PROFILE, OUTSIDER]);
  // Their own scan of a SEED barcode, and their own corroborated report on it — still theirs.
  await pool.query(
    `INSERT INTO scans (id, scanner_id, allergen_profile_id, barcode, result, matched_allergens)
     VALUES ($1, $2, $3, $4, 'unable_to_confirm', '[]')`,
    [OUTSIDER_SCAN, OUTSIDER, OUTSIDER_PROFILE, PRODUCTS.unknown.barcode],
  );
  await pool.query(
    `INSERT INTO product_corrections
       (id, scan_id, barcode, reported_by, correction_type, direction, allergen, target, verdict_at_report, photo_path, status)
     VALUES ($1, $2, $3, $4, 'flag_missing', 'add_caution', 'Milk', 'off_data', 'unable_to_confirm', 'corrections/none.jpg', 'corroborated')`,
    [OUTSIDER_CORRECTION, OUTSIDER_SCAN, PRODUCTS.unknown.barcode, OUTSIDER],
  );
  await pool.query("INSERT INTO nps_responses (id, user_id, score, reason) VALUES ($1, $2, 9, 'real feedback')", [OUTSIDER_NPS, OUTSIDER]);

  const outsiderRows = async () => {
    const q = async (sql: string, id: string) => (await pool.query(`SELECT to_jsonb(t) AS row FROM (${sql}) t`, [id])).rows.map((r) => r.row);
    return {
      user: await q("SELECT * FROM users WHERE id = $1", OUTSIDER),
      profile: await q("SELECT * FROM allergen_profiles WHERE id = $1", OUTSIDER_PROFILE),
      scan: await q("SELECT * FROM scans WHERE id = $1", OUTSIDER_SCAN),
      correction: await q("SELECT * FROM product_corrections WHERE id = $1", OUTSIDER_CORRECTION),
      nps: await q("SELECT * FROM nps_responses WHERE id = $1", OUTSIDER_NPS),
    };
  };
  const before = await outsiderRows();

  await seed();
  await seed();
  assert.deepEqual(await outsiderRows(), before);
});

test("guard: a non-seeded person on a seeded profile aborts the seed, and nothing changes", async () => {
  // A judge invited a real address to follow Maya, and it scanned for her once.
  await pool.query(
    `INSERT INTO follow_relationships (allergen_profile_id, follower_id, invited_by, token_hash, status, share_level)
     VALUES ($1, $2, $3, 'seed-guard-test-token', 'accepted', 'all')`,
    [PROFILES.maya.id, OUTSIDER, PEOPLE.judge.id],
  );
  await pool.query(
    `INSERT INTO scans (scanner_id, allergen_profile_id, barcode, result, matched_allergens)
     VALUES ($1, $2, $3, 'safe', '[]')`,
    [OUTSIDER, PROFILES.maya.id, PRODUCTS.crackers.barcode],
  );
  const before = await snapshot();

  await assert.rejects(seed(), (err: unknown) => {
    assert.ok(err instanceof SeedConflictError);
    assert.deepEqual(err.conflicts, { coManagers: 0, followers: 1, scans: 1, products: 0 });
    return true;
  });
  assert.deepEqual(await snapshot(), before, "rolled back — the seed is exactly as it was");
  const { rows } = await pool.query("SELECT 1 FROM follow_relationships WHERE follower_id = $1", [OUTSIDER]);
  assert.equal(rows.length, 1);
});

test("--force removes non-seeded people's rows on seeded profiles only, then reseeds", async () => {
  const summary = await seed(true);
  assert.deepEqual(summary.forcedRemovals, { coManagers: 0, followers: 1, scans: 1, products: 0 });

  const { rows: follows } = await pool.query("SELECT 1 FROM follow_relationships WHERE follower_id = $1", [OUTSIDER]);
  assert.equal(follows.length, 0, "their follow of a seeded child is gone");
  const { rows: own } = await pool.query(
    `SELECT (SELECT count(*) FROM users WHERE id = $1) AS users,
            (SELECT count(*) FROM allergen_profiles WHERE id = $2) AS profiles,
            (SELECT count(*) FROM scans WHERE id = $3) AS scans`,
    [OUTSIDER, OUTSIDER_PROFILE, OUTSIDER_SCAN],
  );
  assert.deepEqual(own[0], { users: "1", profiles: "1", scans: "1" }, "their own account, profile and scans are untouched");
  assert.deepEqual(await snapshot(), baseline);
});

type CardAllergen = {
  allergenName: string;
  classification: string;
  communityReported?: boolean;
  uncheckedBecause?: string;
};
type EffectiveCard = { result: string; matched_allergens: CardAllergen[] };

type RescanBody = {
  id: string;
  result: string;
  effective: EffectiveCard | null;
  community_reports: { allergenName: string; reporterCount: number }[];
  evidence_decision: { photo: string; reason?: string } | null;
};

type HistoryEntry = {
  id: string;
  effective: EffectiveCard | null;
  community_reports: { allergenName: string; reporterCount: number }[];
};

/** POST /scans as the judge, straight through the route's own handler (no HTTP harness here). */
function rescan(allergenProfileId: string, barcode: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const layer = (scansRouter as any).stack.find((l: any) => l.route?.path === "/scans" && l.route.methods.post);
  const handler = layer.route.stack.at(-1).handle;
  return new Promise<RescanBody>((resolve, reject) => {
    const res = {
      status: () => res,
      json: (body: RescanBody) => resolve(body),
    };
    handler({ body: { allergenProfileId, barcode }, user: { id: PEOPLE.judge.id } }, res, (err: unknown) =>
      reject(err ?? new Error("next() without a response")),
    );
  });
}

/** GET /profiles/:id/scans as the judge, the same way rescan() reaches POST /scans. */
function history(profileId: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const layer = (scansRouter as any).stack.find((l: any) => l.route?.path === "/profiles/:id/scans" && l.route.methods.get);
  const handler = layer.route.stack.at(-1).handle;
  return new Promise<HistoryEntry[]>((resolve, reject) => {
    handler({ params: { id: profileId }, user: { id: PEOPLE.judge.id } }, { json: resolve }, (err: unknown) =>
      reject(err ?? new Error("next() without a response")),
    );
  });
}

/** Runs `body` with the network refused, past the 24h cache TTL — only the seed marker keeps the
 *  seed barcodes from being refetched. */
async function withoutNetwork(body: () => Promise<void>) {
  await pool.query("UPDATE products SET fetched_at = now() - interval '3 days' WHERE barcode = ANY($1)", [SEED_BARCODES]);
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    throw new Error("network call attempted during a rescan of a seeded barcode");
  }) as typeof fetch;
  try {
    await body();
  } finally {
    globalThis.fetch = realFetch;
  }
}

test("rescanning any seeded history barcode reproduces the verdict history shows — no Open Food Facts, no AI", async () => {
  await withoutNetwork(async () => {
    for (const scan of SCANS) {
      const history = baseline.scans.find((s) => s.id === scan.id)!;
      const live = await rescan(PROFILES[scan.profile].id, PRODUCTS[scan.product].barcode);
      assert.equal(live.result, history.result, `${scan.profile} / ${scan.product}`);
    }
  });
});

// The test above compares the engine's `result` only, which is why the seed passed while the
// screen showed a capture form and no card (2026-10-05). This one checks what the card is built
// from: the community-effective verdict, and whether the photo step lets the card render.
test("the seeded shopper report renders Contains for a peanut profile, with the photo offered rather than required", async () => {
  const previous = { community: env.communityCorrections, labelScan: env.labelScan };
  env.communityCorrections = true;
  env.labelScan = true;
  try {
    await withoutNetwork(async () => {
      const maya = await rescan(PROFILES.maya.id, PRODUCTS.reported.barcode);
      assert.equal(maya.result, "unable_to_confirm", "the engine alone has nothing to check");
      assert.equal(maya.effective?.result, "contains_allergen");
      assert.deepEqual(
        maya.community_reports.map((r) => r.allergenName),
        ["Peanut"],
      );
      assert.deepEqual(maya.evidence_decision, { photo: "prompted", reason: "missing_data" });

      // Peanut comes from the shopper report; sesame was checked against nothing. It must say so —
      // unchecked, never clear — while the rollup still lands on contains. The first card to carry
      // a Contains and an unchecked together.
      const byName = new Map(maya.effective!.matched_allergens.map((m) => [m.allergenName, m]));
      assert.equal(byName.get("Peanut")?.classification, "contains");
      assert.equal(byName.get("Peanut")?.communityReported, true, "credited to a shopper report");
      assert.equal(byName.get("Sesame")?.classification, "unchecked");
      assert.equal(byName.get("Sesame")?.uncheckedBecause, "no_product_data");
      assert.equal(byName.get("Sesame")?.communityReported, undefined, "sesame is not credited to a shopper");

      // A judge who scans this and then opens history must see the same card: both the scan just
      // made and the seeded one Priya made, recomputed fresh, match the live response exactly.
      const mayaHistory = await history(PROFILES.maya.id);
      const seededScanId = SCANS.find((x) => x.product === "reported" && x.profile === "maya")!.id;
      for (const id of [maya.id, seededScanId]) {
        const entry = mayaHistory.find((h) => h.id === id);
        assert.ok(entry, `history has scan ${id}`);
        assert.deepEqual(entry.effective, maya.effective, `history card for ${id}`);
        assert.deepEqual(entry.community_reports, maya.community_reports, `history reports for ${id}`);
      }

      // Tree nut must not pick up a peanut report — still nothing to show but the capture form.
      const noor = await rescan(PROFILES.noor.id, PRODUCTS.reported.barcode);
      assert.equal(noor.effective, null);
      assert.deepEqual(noor.evidence_decision, { photo: "required", reason: "missing_data" });
    });
  } finally {
    env.communityCorrections = previous.community;
    env.labelScan = previous.labelScan;
  }
});
