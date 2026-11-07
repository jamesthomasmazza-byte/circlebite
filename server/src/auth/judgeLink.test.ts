import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import type { AddressInfo } from "node:net";
import { rm } from "node:fs/promises";
import path from "node:path";
import { after, before, beforeEach, test } from "node:test";

import { createApp } from "../app.js";
import { claimKey, countCorroboratingFamilies, recordCorrection } from "../corrections/recordCorrection.js";
import { pool } from "../db/pool.js";
import { runJudgeSeed, seededAllergenKey } from "../db/seed/judgeSeed.js";
import {
  CIRCLE_REPORTS,
  JUDGE_LINK_POOL,
  JUDGE_LINK_POOL_EMAILS,
  PEOPLE,
  PRODUCTS,
  PROFILES,
  SCANS,
  SEEDED_REPORTS,
} from "../db/seed/seedData.js";
import { holdSeedDomain } from "../db/seed/seedDomainLock.js";
import { env } from "../env.js";
import { SEED_EMAIL_DOMAIN } from "../lib/seedMarker.js";
import { adminRouter } from "../routes/admin.js";
import { hashPassword } from "./password.js";
import { JUDGE_LINK_RATE } from "./judgeLink.js";
import { SESSION_COOKIE_NAME } from "./session.js";

// The judge link (Prof. Yoest, Nov 5, 2026, 4:38 PM; docs/approvals/2026-11-05-yoest-one-click-judge-link.md),
// end to end over real HTTP: createApp(), so requireAuth, the admin gate and the error handler are
// the app's own. Real Postgres, the real judge seed and its 40-world pool.

// A token made per run, never written down (R8). Only its SHA-256 goes in env, as on the box.
const TOKEN = randomBytes(32).toString("base64url");
const TOKEN_HASH = createHash("sha256").update(TOKEN).digest("hex");
const JUDGE_BARCODE = "2990000000083";

// Real accounts the link must never reach: an operator-style admin, and an ordinary parent.
const OPERATOR = "7e571000-0000-0000-0000-000000000001";
const REAL_PARENT = "7e571000-0000-0000-0000-000000000002";
const REAL_CHILD = "7e571000-0000-0000-0000-000000000003";
const REAL_SCAN = "7e571000-0000-0000-0000-000000000004";

let base: string;
let server: ReturnType<ReturnType<typeof createApp>["listen"]>;
let releaseSeedDomain: () => Promise<void>;
const saved = {
  judgeLink: env.judgeLink,
  expires: env.judgeLinkExpires,
  hash: env.judgeLinkTokenHash,
  community: env.communityCorrections,
  circle: env.circleEscalations,
};

before(async () => {
  // judgeSeed.test.ts runs the seed too: the two take turns (seedDomainLock.ts).
  releaseSeedDomain = await holdSeedDomain();
  const loginHash = await hashPassword(randomBytes(16).toString("base64url"));
  await runJudgeSeed({
    judgePasswordHashes: Object.fromEntries(["judge1", "judge2", "judge3", "judge4", "checker"].map((k) => [k, loginHash])),
    otherPasswordHash: await hashPassword(randomBytes(32).toString("base64url")),
    force: true,
    rotatePasswords: true,
  });
  await removeFixtures(); // a run that died before its cleanup
  await pool.query(
    `INSERT INTO users (id, email, password_hash, display_name, age_attested_adult, age_attested_at, is_admin) VALUES
       ($1, 'judge-link-operator@example.com', 'x', 'Operator', true, now(), true),
       ($2, 'judge-link-parent@example.com', 'x', 'Real parent', true, now(), false)`,
    [OPERATOR, REAL_PARENT],
  );
  await pool.query("INSERT INTO allergen_profiles (id, manager_id, label) VALUES ($1, $2, 'Real child')", [REAL_CHILD, REAL_PARENT]);
  await pool.query(
    `INSERT INTO allergens (allergen_profile_id, name, severity, treat_traces_as_unsafe, allergen_key, key_needs_review)
     VALUES ($1, 'Peanut', 'severe', true, $2, false)`,
    [REAL_CHILD, seededAllergenKey("Peanut")],
  );
  await pool.query(
    `INSERT INTO scans (id, scanner_id, allergen_profile_id, barcode, product_name, product_brand, ingredients_text,
                        product_data, result, matched_allergens, source, community_corrections_applied)
     VALUES ($1, $2, $3, $4, 'Corn Tortilla Chips', 'Fernhallow', 'ground corn', '{}', 'safe', '[]', 'barcode', '[]')`,
    [REAL_SCAN, REAL_PARENT, REAL_CHILD, JUDGE_BARCODE],
  );

  server = createApp().listen(0);
  await new Promise<void>((resolve) => server.once("listening", () => resolve()));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

beforeEach(async () => {
  env.judgeLink = true;
  env.judgeLinkExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);
  env.judgeLinkTokenHash = TOKEN_HASH;
  env.communityCorrections = true;
  env.circleEscalations = true;
  // Every pool world unused again, and the rate window empty: each test starts from a fresh pool.
  await pool.query("DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE email = ANY($1))", [JUDGE_LINK_POOL_EMAILS]);
});

after(async () => {
  Object.assign(env, {
    judgeLink: saved.judgeLink,
    judgeLinkExpires: saved.expires,
    judgeLinkTokenHash: saved.hash,
    communityCorrections: saved.community,
    circleEscalations: saved.circle,
  });
  if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
  await removeFixtures();
  // Everything the seed made, as judgeSeed.test.ts leaves it: a dev database with no seed.
  await pool.query("DELETE FROM product_corrections WHERE barcode = ANY($1) AND judge_world_at_report IS NOT NULL", [[JUDGE_BARCODE]]);
  await pool.query("DELETE FROM product_corrections WHERE id = ANY($1)", [SEEDED_REPORTS.map((r) => r.id)]);
  await pool.query("DELETE FROM users WHERE email LIKE $1", [`%@${SEED_EMAIL_DOMAIN}`]);
  await Promise.all(SEEDED_REPORTS.map((r) => rm(path.join(env.uploadDir, r.photoPath), { force: true })));
  await releaseSeedDomain();
  await pool.end();
});

async function removeFixtures() {
  await pool.query("DELETE FROM product_corrections WHERE scan_id = $1 OR reported_by = ANY($2)", [REAL_SCAN, [REAL_PARENT]]);
  await pool.query("DELETE FROM users WHERE id = ANY($1)", [[OPERATOR, REAL_PARENT]]);
}

type Reply = { status: number; body: Record<string, unknown>; cookie: string | null };

async function call(method: string, urlPath: string, options: { body?: unknown; cookie?: string | null } = {}): Promise<Reply> {
  const res = await fetch(`${base}${urlPath}`, {
    method,
    headers: {
      ...(options.body === undefined ? {} : { "content-type": "application/json" }),
      ...(options.cookie ? { cookie: options.cookie } : {}),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const text = await res.text();
  const setCookie = res.headers.get("set-cookie");
  return {
    status: res.status,
    body: text.startsWith("{") ? JSON.parse(text) : { text },
    cookie: setCookie ? setCookie.split(";")[0] : null,
  };
}

/** One click on the link: the real token unless one is given. `{ token: undefined }` sends none. */
function click(options: { token?: unknown; extra?: Record<string, unknown> } = { token: TOKEN }): Promise<Reply> {
  const body = "token" in options ? { token: options.token, ...options.extra } : { ...options.extra };
  return call("POST", "/api/auth/judge-link", { body });
}

const PLAIN_404 = { status: 404, body: { error: "not_found" }, cookie: null };

// ---- The one Prof. Yoest asked for ----------------------------------------------------------------

test("a judge-link session gets 404 from every admin page and admin API", async () => {
  const signedIn = await click();
  assert.equal(signedIn.status, 200);
  assert.ok(signedIn.cookie?.startsWith(`${SESSION_COOKIE_NAME}=`));
  // The session is real: it reads its own account.
  const me = await call("GET", "/api/me", { cookie: signedIn.cookie });
  assert.equal(me.status, 200);
  assert.equal((me.body.user as { isAdmin: boolean }).isAdmin, false);

  // Every route the admin router has, read from the router itself, so one added later is covered
  // too. A real, pending correction fills :correctionId, so a 404 can't come from a missing row.
  const correctionId = CIRCLE_REPORTS[0].id;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const routes = (adminRouter as any).stack
    .filter((l: any) => l.route)
    .flatMap((l: any) => Object.keys(l.route.methods).map((m) => [m.toUpperCase(), l.route.path.replace(":correctionId", correctionId)]));
  assert.ok(routes.length >= 6, "every admin API: AI accuracy, NPS, the review queue, reject, accept, photo");
  // The three admin pages (client main.tsx) load their data from these; a 404 is what they get.
  for (const page of ["/admin/ai-accuracy", "/admin/review-queue", "/admin/nps"]) {
    assert.ok(routes.some(([m, p]: [string, string]) => m === "GET" && p === page), page);
  }
  for (const [method, routePath] of routes as [string, string][]) {
    const res = await call(method, `/api${routePath}`, { cookie: signedIn.cookie, body: method === "POST" ? { reason: "judge link test" } : undefined });
    assert.deepEqual([res.status, res.body], [404, { error: "not_found" }], `${method} ${routePath}`);
  }
  // Nothing was changed by the attempts: the seeded report is still pending.
  const { rows } = await pool.query("SELECT status FROM product_corrections WHERE id = $1", [correctionId]);
  assert.equal(rows[0].status, "pending");
});

// ---- Who it can sign in to ---------------------------------------------------------------------

test("the judge link signs in only to an unused pool judge: never the operator, an admin, a real account or a used world", async () => {
  // Whatever else the body says, it names no account: only the token counts.
  const first = await click({ token: TOKEN, extra: { email: "judge-link-operator@example.com", userId: OPERATOR } });
  assert.equal(first.status, 200);
  assert.ok(JUDGE_LINK_POOL_EMAILS.includes(first.body.email as string), String(first.body.email));
  assert.equal(first.body.isAdmin, false);
  assert.notEqual(first.body.id, OPERATOR);
  assert.notEqual(first.body.id, REAL_PARENT);
  const { rows } = await pool.query("SELECT judge_world, is_admin FROM users WHERE id = $1", [first.body.id]);
  assert.deepEqual(rows, [{ judge_world: JUDGE_LINK_POOL[0].n, is_admin: false }]);

  // A pool judge flipped to admin by hand is skipped, never signed in to.
  const next = JUDGE_LINK_POOL[1];
  await pool.query("UPDATE users SET is_admin = true WHERE id = $1", [PEOPLE[next.judge].id]);
  try {
    const second = await click();
    assert.equal(second.status, 200);
    assert.notEqual(second.body.id, PEOPLE[next.judge].id);
    assert.equal(second.body.email, PEOPLE[JUDGE_LINK_POOL[2].judge].email);
  } finally {
    await pool.query("UPDATE users SET is_admin = false WHERE id = $1", [PEOPLE[next.judge].id]);
  }

  // Judges 1–4, the check account and the reporting families are on the seed domain but not in the
  // pool: no session was ever made for any of them, nor for the real accounts.
  const outsidePool = Object.values(PEOPLE).filter((p) => !JUDGE_LINK_POOL_EMAILS.includes(p.email)).map((p) => p.id);
  const { rows: sessions } = await pool.query("SELECT count(*)::int AS n FROM sessions WHERE user_id = ANY($1)", [
    [...outsidePool, OPERATOR, REAL_PARENT],
  ]);
  assert.equal(sessions[0].n, 0);
});

test("a used world is never handed out again, even after its judge logs out", async () => {
  const first = await click();
  await call("POST", "/api/auth/logout", { cookie: first.cookie });
  const second = await click();
  assert.equal(second.status, 200);
  assert.notEqual(second.body.id, first.body.id);
});

// ---- When it works ------------------------------------------------------------------------------

test("an expired judge link is a plain 404, and the sessions it made stop working", async () => {
  const before = await click();
  assert.equal(before.status, 200);
  env.judgeLinkExpires = new Date(Date.now() - 1000);
  assert.deepEqual(await click(), PLAIN_404);
  assert.equal((await call("GET", "/api/me", { cookie: before.cookie })).status, 401);
});

test("a judge link session never outlives JUDGE_LINK_EXPIRES", async () => {
  env.judgeLinkExpires = new Date(Date.now() + 60 * 60 * 1000);
  const signedIn = await click();
  const expiresAt = new Date(signedIn.body.expiresAt as string).getTime();
  assert.equal(expiresAt, env.judgeLinkExpires.getTime());
});

test("with JUDGE_LINK off the judge link is a plain 404, and the sessions it made stop working", async () => {
  const before = await click();
  assert.equal(before.status, 200);
  env.judgeLink = false;
  assert.deepEqual(await click(), PLAIN_404);
  assert.equal((await call("GET", "/api/me", { cookie: before.cookie })).status, 401);
  // Back on, the same session works again until the expiry: off is a kill switch, not a purge.
  env.judgeLink = true;
  assert.equal((await call("GET", "/api/me", { cookie: before.cookie })).status, 200);
});

test("a wrong, missing or malformed token is the same plain 404 as a missing page, and signs nobody in", async () => {
  const wrong = randomBytes(32).toString("base64url");
  for (const token of [wrong, TOKEN.slice(0, -1), `${TOKEN}x`, "", null, 12345, "a".repeat(500), TOKEN.toUpperCase()]) {
    assert.deepEqual(await click({ token }), PLAIN_404, String(token).slice(0, 12));
  }
  assert.deepEqual(await click({}), PLAIN_404, "no token at all");
  // The same answer an admin page gives anyone who isn't an admin.
  const missing = await call("GET", "/api/admin/ai-accuracy", { cookie: null });
  assert.equal(missing.status, 401, "signed out, requireAuth answers first");
  // No token hash configured: nothing matches, not even the real token.
  env.judgeLinkTokenHash = undefined;
  assert.deepEqual(await click(), PLAIN_404);
  const { rows } = await pool.query("SELECT count(*)::int AS n FROM sessions WHERE user_id IN (SELECT id FROM users WHERE email = ANY($1))", [
    JUDGE_LINK_POOL_EMAILS,
  ]);
  assert.equal(rows[0].n, 0);
});

test("past the global rate limit the judge link is a plain 404, whoever clicks", async () => {
  for (let i = 0; i < JUDGE_LINK_RATE.max; i += 1) assert.equal((await click()).status, 200, `click ${i + 1}`);
  assert.deepEqual(await click(), PLAIN_404);
});

test("an empty pool is a plain 404", async () => {
  // Every world used, longer ago than the rate window, so only the empty pool refuses.
  await pool.query(
    `INSERT INTO sessions (user_id, token_hash, expires_at, created_at)
     SELECT id, 'used-' || id, now() + interval '1 day', now() - interval '1 day' FROM users WHERE email = ANY($1)`,
    [JUDGE_LINK_POOL_EMAILS],
  );
  assert.deepEqual(await click(), PLAIN_404);
});

// ---- Separation ---------------------------------------------------------------------------------

test("two judge-link clicks get two separate worlds, and one world's report never counts toward another's or a real family's", async () => {
  const a = await click();
  const b = await click();
  const worldOf = async (id: unknown) => (await pool.query("SELECT judge_world FROM users WHERE id = $1", [id])).rows[0].judge_world;
  const [worldA, worldB] = [await worldOf(a.body.id), await worldOf(b.body.id)];
  assert.notEqual(worldA, worldB);

  // Each judge reports Peanut on their own Maya, from her seeded scan of the shared barcode; a real
  // family reports Peanut on the same barcode. Without the worlds that is three families.
  const filed: string[] = [];
  try {
    for (const world of [worldA, worldB]) {
      const cast = JUDGE_LINK_POOL.find((c) => c.n === world)!;
      const scan = SCANS.find((s) => s.profile === cast.maya && s.product === "circleReported")!;
      const result = await recordCorrection({
        scanId: scan.id,
        reportedBy: PEOPLE[cast.judge].id,
        correctionType: "flag_missing",
        allergen: "Peanut",
        note: "judge link test",
        photoPath: "corrections/none.jpg",
        origin: "user_initiated",
      });
      filed.push(result.id);
      assert.deepEqual([result.status, result.corroborated], ["pending", false]);
    }
    const real = await recordCorrection({
      scanId: REAL_SCAN,
      reportedBy: REAL_PARENT,
      correctionType: "flag_missing",
      allergen: "Peanut",
      note: "real family",
      photoPath: "corrections/none.jpg",
      origin: "user_initiated",
    });
    filed.push(real.id);
    assert.deepEqual([real.status, real.corroborated], ["pending", false], "the real family's report stays one family's");

    const client = await pool.connect();
    try {
      const key = claimKey("Peanut", "add_caution");
      for (const world of [worldA, worldB, null]) {
        const n = await countCorroboratingFamilies(client, { barcode: JUDGE_BARCODE, key, direction: "add_caution", world });
        assert.equal(n, 1, `world ${world}: one family, not three`);
      }
    } finally {
      client.release();
    }
  } finally {
    await pool.query("DELETE FROM product_corrections WHERE id = ANY($1)", [filed]);
  }
});

// ---- Where it lands ------------------------------------------------------------------------------

test("the judge link lands on Maya's card for 2990000000083", async () => {
  const signedIn = await click();
  const cast = JUDGE_LINK_POOL.find((c) => PEOPLE[c.judge].id === signedIn.body.id)!;
  assert.equal(signedIn.body.profileId, PROFILES[cast.maya].id, "the profile Scan opens with ?judge=1");

  // The scan Scan runs for ?judge=1 (client lib/judgeLink.ts), with the link's own session.
  assert.equal(PRODUCTS.circleReported.barcode, JUDGE_BARCODE);
  const scan = await call("POST", "/api/scans", {
    cookie: signedIn.cookie,
    body: { allergenProfileId: signedIn.body.profileId, barcode: JUDGE_BARCODE },
  });
  assert.equal(scan.status, 201);
  const card = scan.body as { effective?: { result: string }; result?: string; pending_circle_reports: { allergenName: string; reporters: { name: string | null }[] }[] };
  assert.equal(card.effective?.result ?? card.result, "contains_allergen");
  assert.deepEqual(
    card.pending_circle_reports.map((r) => [r.allergenName, r.reporters.map((p) => p.name)]),
    [["Sesame", ["Priya Nair"]]],
  );
});
