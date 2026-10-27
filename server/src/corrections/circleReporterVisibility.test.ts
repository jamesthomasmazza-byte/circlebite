import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, before, test } from "node:test";

import { pool } from "../db/pool.js";
import { env } from "../env.js";
import { scansRouter } from "../routes/scans.js";
import { applyCircleEscalationsIfEnabled, loadCircleEscalations, publicCircleReports } from "./circleEscalations.js";
import { recordCorrection } from "./recordCorrection.js";

// Who a circle report names, by the viewer's role (JT, 2026-10-27, on Prof. Yoest's question of that
// day): the owner and co-managers see each reporter's name and role; a follower sees roles only, and
// "You" for their own. Real Postgres, real reports through recordCorrection.

const OWNER = "aaaaaaaa-0000-0000-0000-0000000000f1";
const CO_MANAGER = "aaaaaaaa-0000-0000-0000-0000000000f2";
const FULL_FOLLOWER = "aaaaaaaa-0000-0000-0000-0000000000f3";
const SEVERE_FOLLOWER = "aaaaaaaa-0000-0000-0000-0000000000f4";
const LEFT = "aaaaaaaa-0000-0000-0000-0000000000f5";
const DELETED = "aaaaaaaa-0000-0000-0000-0000000000f6";
const PROFILE_ID = "bbbbbbbb-0000-0000-0000-0000000000f1";
const BARCODE = "7100000000927";

// Distinct enough that finding one in a response can only mean it was sent.
const NAMES = {
  [OWNER]: "Olive-Owner-f1",
  [CO_MANAGER]: "Carl-CoManager-f2",
  [FULL_FOLLOWER]: "Fern-Follower-f3",
  [SEVERE_FOLLOWER]: "Sev-Follower-f4",
  [LEFT]: "Lee-Left-f5",
  [DELETED]: "Dee-Deleted-f6",
};

let scanId: string;
let previousSwitch: boolean;

const MATCHED = [
  { allergenName: "Eggs", severity: "severe", classification: "clear" },
  { allergenName: "Milk", severity: "mild", classification: "clear" },
  { allergenName: "Sesame", severity: "severe", classification: "clear" },
];

function file(reportedBy: string, allergen: string) {
  return recordCorrection({ scanId, reportedBy, correctionType: "flag_missing", allergen, note: null, photoPath: "/fake.jpg", origin: "user_initiated" });
}

before(async () => {
  previousSwitch = env.circleEscalations;
  env.circleEscalations = true;

  for (const [id, name] of Object.entries(NAMES)) {
    await pool.query(
      `INSERT INTO users (id, email, password_hash, display_name, age_attested_adult, age_attested_at)
       VALUES ($1, $2, 'x', $3, true, now())`,
      [id, `${name.toLowerCase()}@example.com`, name],
    );
  }
  await pool.query("INSERT INTO allergen_profiles (id, manager_id, label) VALUES ($1, $2, 'Visibility Maya')", [PROFILE_ID, OWNER]);
  await pool.query(
    `INSERT INTO allergens (allergen_profile_id, name, severity, treat_traces_as_unsafe)
     VALUES ($1, 'Eggs', 'severe', false), ($1, 'Milk', 'mild', false), ($1, 'Sesame', 'severe', false)`,
    [PROFILE_ID],
  );
  await pool.query("INSERT INTO profile_managers (allergen_profile_id, user_id, added_by) VALUES ($1, $2, $3)", [PROFILE_ID, CO_MANAGER, OWNER]);
  for (const [follower, level, n] of [
    [FULL_FOLLOWER, "all", 1],
    [SEVERE_FOLLOWER, "severe_only", 2],
    [LEFT, "all", 3],
    [DELETED, "all", 4],
  ] as const) {
    await pool.query(
      `INSERT INTO follow_relationships (allergen_profile_id, follower_id, invited_by, token_hash, status, share_level, responded_at)
       VALUES ($1, $2, $3, $4, 'accepted', $5, now())`,
      [PROFILE_ID, follower, OWNER, `visibility-test-token-${n}`, level],
    );
  }

  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO scans (allergen_profile_id, barcode, result, matched_allergens, ingredients_text)
     VALUES ($1, $2, 'safe', $3, 'test ingredients') RETURNING id`,
    [PROFILE_ID, BARCODE, JSON.stringify(MATCHED)],
  );
  scanId = rows[0].id;

  // The co-manager reports eggs (severe), a full follower milk (mild); someone who has since left
  // the circle, and someone whose account is gone, report sesame.
  await file(CO_MANAGER, "Eggs");
  await file(FULL_FOLLOWER, "Milk");
  await file(LEFT, "Sesame");
  await file(DELETED, "Sesame");
  await pool.query("UPDATE follow_relationships SET status = 'revoked' WHERE follower_id = $1", [LEFT]);
  await pool.query("DELETE FROM users WHERE id = $1", [DELETED]);
});

after(async () => {
  env.circleEscalations = previousSwitch;
  await pool.query("DELETE FROM product_corrections WHERE barcode = $1", [BARCODE]);
  await pool.query("DELETE FROM scans WHERE allergen_profile_id = $1", [PROFILE_ID]);
  await pool.query("DELETE FROM allergen_profiles WHERE id = $1", [PROFILE_ID]);
  await pool.query("DELETE FROM users WHERE id = ANY($1)", [Object.keys(NAMES)]);
  await pool.end();
});

async function reportersByAllergen(viewerId: string) {
  const [escalations] = await loadCircleEscalations(PROFILE_ID, [{ id: scanId, barcode: BARCODE }], viewerId);
  const by = new Map<string, unknown[]>();
  for (const e of escalations) by.set(e.allergen, [...(by.get(e.allergen) ?? []), e.reporter]);
  return Object.fromEntries(by);
}

const deleted = { name: null, role: null, isViewer: false, withheld: false };

for (const [label, viewer] of [
  ["the owner", OWNER],
  ["a co-manager", CO_MANAGER],
] as const) {
  test(`${label} sees every reporter's name and role`, async () => {
    const own = viewer === CO_MANAGER;
    assert.deepEqual(await reportersByAllergen(viewer), {
      Eggs: [{ name: NAMES[CO_MANAGER], role: "co_manager", isViewer: own, withheld: false }],
      Milk: [{ name: NAMES[FULL_FOLLOWER], role: "follower", isViewer: false, withheld: false }],
      Sesame: [{ name: NAMES[LEFT], role: null, isViewer: false, withheld: false }, deleted],
    });
  });
}

test("a full follower sees roles only, and their own report as theirs", async () => {
  assert.deepEqual(await reportersByAllergen(FULL_FOLLOWER), {
    Eggs: [{ name: null, role: "co_manager", isViewer: false, withheld: true }],
    Milk: [{ name: NAMES[FULL_FOLLOWER], role: "follower", isViewer: true, withheld: false }],
    Sesame: [{ name: null, role: null, isViewer: false, withheld: true }, deleted],
  });
});

test("a severe-only follower sees roles only, another follower's report included", async () => {
  assert.deepEqual(await reportersByAllergen(SEVERE_FOLLOWER), {
    Eggs: [{ name: null, role: "co_manager", isViewer: false, withheld: true }],
    Milk: [{ name: null, role: "follower", isViewer: false, withheld: true }],
    Sesame: [{ name: null, role: null, isViewer: false, withheld: true }, deleted],
  });
});

test("someone with no access to the profile is shown roles only: withholding is the side to fail on", async () => {
  const reporters = Object.values(await reportersByAllergen(LEFT)).flat() as { name: string | null }[];
  const named = reporters.filter((r) => r.name !== null).map((r) => r.name);
  assert.deepEqual(named, [NAMES[LEFT]], "only their own report keeps a name");
});

// What actually leaves the server. The live card (barcode scan, label scan, combined scan) goes
// through applyCircleEscalationsIfEnabled, history and a report's own response through
// loadUserScanViews: both load with loadCircleEscalations.

function serializedNames(payload: unknown): string[] {
  const json = JSON.stringify(payload);
  return Object.values(NAMES).filter((n) => json.includes(n));
}

async function liveCardReports(viewerId: string) {
  const circle = await applyCircleEscalationsIfEnabled(
    { profileId: PROFILE_ID, scanId: null, barcode: BARCODE, viewerId },
    { result: "safe", matchedAllergens: MATCHED } as never,
    [
      { name: "Eggs", severity: "severe" },
      { name: "Milk", severity: "mild" },
      { name: "Sesame", severity: "severe" },
    ],
  );
  return publicCircleReports(circle?.applied ?? []);
}

function getHistory(userId: string): Promise<unknown> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const layer = (scansRouter as any).stack.find((l: any) => l.route?.path === "/profiles/:id/scans" && l.route.methods.get);
  const handler = layer.route.stack.at(-1).handle;
  return new Promise((resolve, reject) => {
    const res = { status: () => res, json: resolve };
    handler({ params: { id: PROFILE_ID }, user: { id: userId } }, res, (err: unknown) => reject(err ?? new Error("next() without a response")));
  });
}

test("a follower's live card and history carry no other member's name; the owner's carry them", async () => {
  for (const follower of [FULL_FOLLOWER, SEVERE_FOLLOWER]) {
    const own = follower === FULL_FOLLOWER ? [NAMES[FULL_FOLLOWER]] : [];
    const live = await liveCardReports(follower);
    assert.ok(live.length > 0, "the live card shows the reports");
    assert.deepEqual(serializedNames(live), own, "live card");
    // History shows their own report as their own correction, not a circle report: no name at all.
    assert.deepEqual(serializedNames(await getHistory(follower)), [], "history");
  }
  assert.deepEqual(serializedNames(await liveCardReports(OWNER)), [NAMES[CO_MANAGER], NAMES[FULL_FOLLOWER], NAMES[LEFT]]);
});

test("a severe-only follower's history still lists reports for severe allergens only", async () => {
  const history = (await getHistory(SEVERE_FOLLOWER)) as { pending_circle_reports: { allergenName: string }[] }[];
  assert.deepEqual(history[0].pending_circle_reports.map((r) => r.allergenName).sort(), ["Eggs", "Sesame"]);
});

test("every response that carries circle reports gets them from loadCircleEscalations", () => {
  const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
  const sources = ["../routes/scans.ts", "../routes/corrections.ts", "../verdict/labelScan.ts", "../verdict/combineScan.ts"];
  for (const path of sources) {
    const source = read(path);
    // Values, not type declarations.
    for (const line of source.split("\n").filter((l) => /pending_circle_reports:\s*[a-z]/.test(l))) {
      assert.match(line, /publicCircleReports\(/, `${path}: ${line.trim()}`);
    }
  }
  // The only two loaders, and neither builds a reporter itself.
  assert.match(read("./userScanView.ts"), /loadCircleEscalations\(profileId, scans, userId\)/);
  assert.match(read("./circleEscalations.ts"), /reporter: circleReporter\(r, viewerId, seesNames\)/);
});
