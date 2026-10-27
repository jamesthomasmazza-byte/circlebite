import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";

import { getProfileAccess } from "../authorization/profiles.js";
import { pool } from "../db/pool.js";
import { env } from "../env.js";
import { runCircleRequestPurge } from "../jobs/circleRequestRetention.js";
import { circleRequestsRouter, MAX_WAITING_PER_OWNER } from "./circleRequests.js";

// Follow requests (migration 0047, 2026-10-27). No HTTP harness in this codebase (see me.test.ts):
// this runs each route's own middleware after requireAuth — the switch check and the handler —
// with a fake req carrying the user requireAuth would have attached. Real Postgres throughout.

const u = (n: number) => `cccccccc-0000-0000-0000-0000000001${String(n).padStart(2, "0")}`;
const OWNER = u(1);
const REQUESTER = u(2);
const NO_PROFILES = u(3);
const CO_MANAGER = u(4);
const FOLLOWER = u(5);
const SECOND_REQUESTER = u(6);
const NOT_ADULT = u(7);
const RATE = u(8);
const LEFT_EARLIER = u(9);
const BUSY_OWNER = u(10);
const LEAVER = u(11);
const P1 = "dddddddd-0000-0000-0000-000000000101";
const P2 = "dddddddd-0000-0000-0000-000000000102";
const CO_MANAGERS_OWN = "dddddddd-0000-0000-0000-000000000103";
const BUSY_PROFILE = "dddddddd-0000-0000-0000-000000000104";

const email = (id: string) => `req-test-${id.slice(-3)}@example.com`;
const ALL_USERS = [OWNER, REQUESTER, NO_PROFILES, CO_MANAGER, FOLLOWER, SECOND_REQUESTER, NOT_ADULT, RATE, LEFT_EARLIER, BUSY_OWNER, LEAVER];
const FILLERS: string[] = Array.from({ length: MAX_WAITING_PER_OWNER }, (_, i) => `cccccccc-0000-0000-0000-0000000002${String(i).padStart(2, "0")}`);

type Result = { status: number; body: unknown };

function call(method: "get" | "post", path: string, userId: string, body: unknown = {}, params: Record<string, string> = {}, ip = "203.0.113.9"): Promise<Result> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const layer = (circleRequestsRouter as any).stack.find((l: any) => l.route?.path === path && l.route.methods[method]);
  assert.ok(layer, `expected ${method.toUpperCase()} ${path}`);
  // [0] is requireAuth: replaced by the user on req.
  const handlers = layer.route.stack.slice(1).map((s: { handle: unknown }) => s.handle);
  return new Promise((resolve, reject) => {
    let status = 200;
    const res = {
      status(code: number) {
        status = code;
        return res;
      },
      json(payload: unknown) {
        resolve({ status, body: payload });
      },
      end() {
        resolve({ status, body: null });
      },
    };
    const req = { user: { id: userId, email: email(userId) }, body, params, ip };
    const run = (i: number) => (err?: unknown) => {
      if (err) {
        const e = err as { status?: number; code?: string };
        if (e.status) resolve({ status: e.status, body: { error: e.code } });
        else reject(err);
        return;
      }
      if (i >= handlers.length) return reject(new Error("no response"));
      handlers[i](req, res, run(i + 1));
    };
    run(0)();
  });
}

const ask = (from: string, address: string, ip?: string) => call("post", "/circle-requests", from, { email: address }, {}, ip);
const incoming = (owner: string) => call("get", "/circle-requests", owner);
const approve = (as: string, id: string, body: unknown) => call("post", "/circle-requests/:id/approve", as, body, { id });
const decline = (as: string, id: string) => call("post", "/circle-requests/:id/decline", as, {}, { id });

async function requestRows(from: string, to: string) {
  const { rows } = await pool.query("SELECT id, status FROM circle_requests WHERE requester_id = $1 AND owner_id = $2", [from, to]);
  return rows as { id: string; status: string }[];
}

let previousSwitch: boolean;

before(async () => {
  previousSwitch = env.circleRequests;
  env.circleRequests = true;
  for (const id of [...ALL_USERS, ...FILLERS]) {
    await pool.query(
      `INSERT INTO users (id, email, password_hash, display_name, age_attested_adult, age_attested_at)
       VALUES ($1, $2, 'x', $3, $4, now())`,
      [id, email(id), `Req ${id.slice(-3)}`, id !== NOT_ADULT],
    );
  }
  await pool.query(
    `INSERT INTO allergen_profiles (id, manager_id, label) VALUES
       ($1, $2, 'Req Maya'), ($3, $2, 'Req Leo'), ($4, $5, 'Req CoManagers Own'), ($6, $7, 'Req Busy')`,
    [P1, OWNER, P2, CO_MANAGERS_OWN, CO_MANAGER, BUSY_PROFILE, BUSY_OWNER],
  );
  await pool.query("INSERT INTO allergens (allergen_profile_id, name, severity, treat_traces_as_unsafe) VALUES ($1, 'Peanut', 'severe', true)", [P1]);
  await pool.query("INSERT INTO profile_managers (allergen_profile_id, user_id, added_by) VALUES ($1, $2, $3)", [P1, CO_MANAGER, OWNER]);
  await pool.query(
    `INSERT INTO follow_relationships (allergen_profile_id, follower_id, invited_by, token_hash, status, share_level, responded_at)
     VALUES ($1, $2, $3, 'req-test-token-1', 'accepted', 'all', now()), ($1, $4, $3, 'req-test-token-2', 'revoked', 'all', now())`,
    [P1, FOLLOWER, OWNER, LEFT_EARLIER],
  );
});

// Every test but the rate limit's starts with a clean count, so earlier tests' requests don't trip it.
beforeEach(async () => {
  await pool.query("DELETE FROM auth_attempts WHERE endpoint = 'circle_request'");
});

after(async () => {
  env.circleRequests = previousSwitch;
  await pool.query("DELETE FROM auth_attempts WHERE endpoint = 'circle_request'");
  await pool.query("DELETE FROM allergen_profiles WHERE id = ANY($1)", [[P1, P2, CO_MANAGERS_OWN, BUSY_PROFILE]]);
  await pool.query("DELETE FROM users WHERE id = ANY($1)", [[...ALL_USERS, ...FILLERS]]);
  await pool.end();
});

const RECEIVED = { status: 202, body: { received: true } };

test("the same answer in every case, and a request only when there's an owner to ask", async () => {
  // As typed: case and spaces don't matter.
  assert.deepEqual(await ask(REQUESTER, `  ${email(OWNER).toUpperCase()} `), RECEIVED, "an owner");
  assert.deepEqual(await ask(REQUESTER, "nobody-at-all@example.com"), RECEIVED, "no account");
  assert.deepEqual(await ask(REQUESTER, email(REQUESTER)), RECEIVED, "their own address");
  assert.deepEqual(await ask(REQUESTER, email(NO_PROFILES)), RECEIVED, "an account that owns no profile");
  assert.deepEqual(await ask(REQUESTER, email(OWNER)), RECEIVED, "a request already waiting");

  assert.equal((await requestRows(REQUESTER, OWNER)).length, 1);
  const { rows } = await pool.query("SELECT count(*)::int AS n FROM circle_requests WHERE requester_id = $1", [REQUESTER]);
  assert.equal(rows[0].n, 1, "nothing for the other four");
});

test("the address someone types is never stored, not even hashed", async () => {
  const typed = "Typed-Address-Never-Kept@example.com";
  await ask(REQUESTER, typed);
  for (const table of ["circle_requests", "auth_attempts"]) {
    const { rows } = await pool.query(`SELECT row_to_json(t)::text AS row FROM ${table} t`);
    for (const { row } of rows as { row: string }[]) {
      assert.doesNotMatch(row, /typed-address-never-kept/i, table);
    }
  }
});

test("a requester sees nothing: no list of what they sent, and no access until approved", async () => {
  assert.deepEqual(await incoming(REQUESTER), { status: 200, body: [] });
  assert.equal(await getProfileAccess(REQUESTER, P1), null);
  assert.equal(await getProfileAccess(REQUESTER, P2), null);
});

test("the owner sees the request: the requester's name and email, and only their own profiles to offer", async () => {
  const { body } = await incoming(OWNER);
  const list = body as { requester_name: string; requester_email: string; profiles: { id: string; label: string }[] }[];
  assert.equal(list.length, 1);
  assert.equal(list[0].requester_name, `Req ${REQUESTER.slice(-3)}`);
  assert.equal(list[0].requester_email, email(REQUESTER));
  assert.deepEqual(list[0].profiles.map((p) => p.label), ["Req Maya", "Req Leo"]);
});

test("only the owner decides: a co-manager or follower of the profile gets nothing and can't act", async () => {
  const [request] = await requestRows(REQUESTER, OWNER);
  for (const other of [CO_MANAGER, FOLLOWER]) {
    assert.deepEqual(await incoming(other), { status: 200, body: [] });
    assert.equal((await approve(other, request.id, { profileId: P1, shareLevel: "all" })).status, 404);
    assert.equal((await decline(other, request.id)).status, 404);
  }
  assert.equal((await requestRows(REQUESTER, OWNER))[0].status, "pending");
});

test("approving needs a share level, and one of the owner's own profiles", async () => {
  const [request] = await requestRows(REQUESTER, OWNER);
  assert.equal((await approve(OWNER, request.id, { profileId: P1 })).status, 400, "no share level chosen");
  assert.equal((await approve(OWNER, request.id, { profileId: P1, shareLevel: "most" })).status, 400);
  assert.equal((await approve(OWNER, request.id, { profileId: CO_MANAGERS_OWN, shareLevel: "all" })).status, 404, "not the owner's");
});

test("approving creates a follow at the chosen level and removes the request", async () => {
  const [request] = await requestRows(REQUESTER, OWNER);
  assert.equal((await approve(OWNER, request.id, { profileId: P1, shareLevel: "severe_only" })).status, 204);
  assert.deepEqual(await getProfileAccess(REQUESTER, P1), { level: "follower", shareLevel: "severe_only" });
  assert.equal(await getProfileAccess(REQUESTER, P2), null, "only the profile chosen");
  assert.deepEqual(await requestRows(REQUESTER, OWNER), [], "approved requests aren't kept");
  assert.deepEqual((await incoming(OWNER)).body, []);
});

test("a second request offers only what they don't see yet; once they see everything, asking is dropped", async () => {
  assert.deepEqual(await ask(REQUESTER, email(OWNER)), RECEIVED);
  const [request] = await requestRows(REQUESTER, OWNER);
  const list = (await incoming(OWNER)).body as { profiles: { id: string }[] }[];
  assert.deepEqual(list[0].profiles.map((p) => p.id), [P2]);
  assert.equal((await approve(OWNER, request.id, { profileId: P1, shareLevel: "all" })).status, 409, "already follows it");
  assert.equal((await approve(OWNER, request.id, { profileId: P2, shareLevel: "all" })).status, 204);

  assert.deepEqual(await ask(REQUESTER, email(OWNER)), RECEIVED);
  assert.deepEqual(await requestRows(REQUESTER, OWNER), [], "nothing left to offer them");
});

test("declined: kept 30 days so asking again is dropped, then purged", async () => {
  await ask(SECOND_REQUESTER, email(OWNER));
  const [request] = await requestRows(SECOND_REQUESTER, OWNER);
  assert.equal((await decline(OWNER, request.id)).status, 204);
  assert.equal((await requestRows(SECOND_REQUESTER, OWNER))[0].status, "declined");
  assert.equal((await approve(OWNER, request.id, { profileId: P1, shareLevel: "all" })).status, 404, "decided");

  assert.deepEqual(await ask(SECOND_REQUESTER, email(OWNER)), RECEIVED);
  assert.equal((await requestRows(SECOND_REQUESTER, OWNER)).length, 1, "the same declined row, no new one");

  await pool.query("UPDATE circle_requests SET responded_at = now() - interval '29 days' WHERE id = $1", [request.id]);
  await runCircleRequestPurge();
  assert.equal((await requestRows(SECOND_REQUESTER, OWNER)).length, 1, "kept until 30 days");

  await pool.query("UPDATE circle_requests SET responded_at = now() - interval '31 days' WHERE id = $1", [request.id]);
  const purge = await runCircleRequestPurge();
  assert.equal(purge.status, "ok");
  assert.deepEqual(await requestRows(SECOND_REQUESTER, OWNER), []);
  const { rows } = await pool.query("SELECT 1 FROM retention_runs WHERE job_name = 'circle_request_retention' AND finished_at > now() - interval '1 minute'");
  assert.ok(rows.length > 0, "recorded in retention_runs");

  assert.deepEqual(await ask(SECOND_REQUESTER, email(OWNER)), RECEIVED);
  assert.equal((await requestRows(SECOND_REQUESTER, OWNER))[0].status, "pending", "can ask again after the purge");
});

test("approval confirms the requester attested to being an adult (docs/coppa.md §2.4)", async () => {
  await ask(NOT_ADULT, email(OWNER));
  const [request] = await requestRows(NOT_ADULT, OWNER);
  assert.deepEqual(await approve(OWNER, request.id, { profileId: P1, shareLevel: "all" }), { status: 409, body: { error: "requester_not_eligible" } });
  assert.equal(await getProfileAccess(NOT_ADULT, P1), null);
});

test("someone whose follow was revoked can be approved again", async () => {
  await ask(LEFT_EARLIER, email(OWNER));
  const [request] = await requestRows(LEFT_EARLIER, OWNER);
  assert.equal((await approve(OWNER, request.id, { profileId: P1, shareLevel: "all" })).status, 204);
  assert.deepEqual(await getProfileAccess(LEFT_EARLIER, P1), { level: "follower", shareLevel: "all" });
});

test("an owner with the most requests waiting gets no more, and the requester can't tell", async () => {
  for (const filler of FILLERS) await pool.query("INSERT INTO circle_requests (requester_id, owner_id) VALUES ($1, $2)", [filler, BUSY_OWNER]);
  assert.deepEqual(await ask(REQUESTER, email(BUSY_OWNER)), RECEIVED);
  assert.deepEqual(await requestRows(REQUESTER, BUSY_OWNER), []);
});

test("rate limited by the requester's own account: the eleventh in a day is refused", async () => {
  for (let i = 0; i < 10; i++) assert.deepEqual(await ask(RATE, `rate-${i}@example.com`, `198.51.100.${i}`), RECEIVED);
  assert.deepEqual(await ask(RATE, email(OWNER), "198.51.100.99"), { status: 429, body: { error: "too_many_attempts" } });
  assert.deepEqual(await requestRows(RATE, OWNER), [], "refused before anything is filed");
});

test("deleting either account deletes its requests", async () => {
  await ask(LEAVER, email(OWNER));
  assert.equal((await requestRows(LEAVER, OWNER)).length, 1);
  await pool.query("DELETE FROM users WHERE id = $1", [LEAVER]);
  assert.deepEqual(await requestRows(LEAVER, OWNER), []);
});

test("with CIRCLE_REQUESTS off, every route is a 404", async () => {
  env.circleRequests = false;
  try {
    assert.equal((await ask(REQUESTER, email(OWNER))).status, 404);
    assert.equal((await incoming(OWNER)).status, 404);
    assert.equal((await approve(OWNER, "00000000-0000-0000-0000-000000000000", { profileId: P1, shareLevel: "all" })).status, 404);
    assert.equal((await decline(OWNER, "00000000-0000-0000-0000-000000000000")).status, 404);
  } finally {
    env.circleRequests = true;
  }
});
