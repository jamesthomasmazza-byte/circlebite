import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";

import { pool } from "../db/pool.js";
import { circleRouter } from "./circle.js";

// GET /profiles/:id/circle — the Circle tab's data. Called through the router's own handler, as
// profiles.test.ts does, so the route's checks run as written.

type Captured = { status: number; body: unknown };

function get(path: string, params: Record<string, string>, userId: string): Promise<Captured> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const layer = (circleRouter as any).stack.find((l: any) => l.route?.path === path && l.route.methods.get);
  assert.ok(layer, `expected a registered GET ${path} route`);
  const handler = layer.route.stack.at(-1).handle;
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
    };
    handler({ params, user: { id: userId } }, res, (err: unknown) => reject(err ?? new Error("next() without responding")));
  });
}

// POST handlers: resolves with the status, whether the route ends with json() or end(), and with
// the HttpError status when it throws one.
function post(path: string, params: Record<string, string>, userId: string, body: unknown = {}): Promise<Captured> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const layer = (circleRouter as any).stack.find((l: any) => l.route?.path === path && l.route.methods.post);
  assert.ok(layer, `expected a registered POST ${path} route`);
  const handler = layer.route.stack.at(-1).handle;
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
    handler({ params, body, user: { id: userId } }, res, (err: unknown) => {
      const code = (err as { status?: number } | undefined)?.status;
      if (code) resolve({ status: code, body: (err as Error).message });
      else reject(err ?? new Error("next() without responding"));
    });
  });
}

const OWNER = randomUUID();
const CO_MANAGER = randomUUID();
const INVITEE = randomUUID();
let profileId = "";

before(async () => {
  await pool.query(
    `INSERT INTO users (id, email, password_hash, display_name, age_attested_adult, age_attested_at)
     VALUES ($1, $3, 'x', 'Sam Owner', true, now()), ($2, $4, 'x', 'Co Judge', true, now()),
            ($5, $6, 'x', 'Invitee', true, now())`,
    [OWNER, CO_MANAGER, `${OWNER}@example.test`, `${CO_MANAGER}@example.test`, INVITEE, `${INVITEE}@example.test`],
  );
  const { rows } = await pool.query<{ id: string }>(
    "INSERT INTO allergen_profiles (manager_id, label) VALUES ($1, 'Circle Test Child') RETURNING id",
    [OWNER],
  );
  profileId = rows[0]!.id;
  await pool.query("INSERT INTO profile_managers (allergen_profile_id, user_id) VALUES ($1, $2)", [profileId, CO_MANAGER]);
});

after(async () => {
  await pool.query("DELETE FROM users WHERE id = ANY($1)", [[OWNER, CO_MANAGER, INVITEE]]);
  await pool.end();
});

test("a co-manager sees whose circle it is: the owner, by display name and never by email", async () => {
  const { body } = await get("/profiles/:id/circle", { id: profileId }, CO_MANAGER);
  const circle = body as { owner: Record<string, unknown> | null; managers: { user_id: string }[] };
  assert.deepEqual(circle.owner, { user_id: OWNER, display_name: "Sam Owner" });
  assert.deepEqual(circle.managers.map((m) => m.user_id), [CO_MANAGER]);
});

test("the owner gets the same field, naming themselves", async () => {
  const { body } = await get("/profiles/:id/circle", { id: profileId }, OWNER);
  assert.equal((body as { owner: { user_id: string } }).owner.user_id, OWNER);
});

// ---- Cancelling invites nobody has accepted (2026-10-26) ----

async function managerInvite(): Promise<{ id: string; token: string }> {
  const { status, body } = await post("/profiles/:id/manager-invites", { id: profileId }, OWNER);
  assert.equal(status, 201);
  return body as { id: string; token: string };
}

test("the owner cancels a co-manager invite, and its link can't be accepted afterwards", async () => {
  const invite = await managerInvite();
  const cancel = await post("/profiles/:id/manager-invites/:inviteId/cancel", { id: profileId, inviteId: invite.id }, OWNER);
  assert.equal(cancel.status, 204);
  const { rows } = await pool.query("SELECT revoked_at FROM manager_invites WHERE id = $1", [invite.id]);
  assert.ok(rows[0].revoked_at, "marked revoked, not deleted");

  const accept = await post("/co-manager/:token/accept", { token: invite.token }, INVITEE);
  assert.equal(accept.status, 404);
  const { rowCount } = await pool.query("SELECT 1 FROM profile_managers WHERE allergen_profile_id = $1 AND user_id = $2", [profileId, INVITEE]);
  assert.equal(rowCount, 0);
});

test("a co-manager can't cancel a co-manager invite: owner-only, refused as not found", async () => {
  const invite = await managerInvite();
  const cancel = await post("/profiles/:id/manager-invites/:inviteId/cancel", { id: profileId, inviteId: invite.id }, CO_MANAGER);
  assert.equal(cancel.status, 404);
  const { rows } = await pool.query("SELECT revoked_at FROM manager_invites WHERE id = $1", [invite.id]);
  assert.equal(rows[0].revoked_at, null, "still live");
});

test("an accepted co-manager invite can't be cancelled; that's removing the co-manager", async () => {
  const invite = await managerInvite();
  assert.equal((await post("/co-manager/:token/accept", { token: invite.token }, INVITEE)).status, 200);
  const cancel = await post("/profiles/:id/manager-invites/:inviteId/cancel", { id: profileId, inviteId: invite.id }, OWNER);
  assert.equal(cancel.status, 404);
  const { rowCount } = await pool.query("SELECT 1 FROM profile_managers WHERE allergen_profile_id = $1 AND user_id = $2", [profileId, INVITEE]);
  assert.equal(rowCount, 1, "still a co-manager");
  await pool.query("DELETE FROM profile_managers WHERE allergen_profile_id = $1 AND user_id = $2", [profileId, INVITEE]);
});

test("a manager cancels a pending follow invite; its link can't be accepted, and an accepted follow isn't touched", async () => {
  const made = await post("/profiles/:id/follow-invites", { id: profileId }, CO_MANAGER, { shareLevel: "all" });
  assert.equal(made.status, 201);
  const invite = made.body as { id: string; token: string };

  const cancel = await post("/profiles/:id/follow-invites/:inviteId/cancel", { id: profileId, inviteId: invite.id }, CO_MANAGER);
  assert.equal(cancel.status, 204);
  assert.equal((await post("/follow/:token/accept", { token: invite.token }, INVITEE)).status, 404);
  assert.equal((await post("/profiles/:id/follow-invites/:inviteId/cancel", { id: profileId, inviteId: invite.id }, OWNER)).status, 404, "twice is not found");

  const second = (await post("/profiles/:id/follow-invites", { id: profileId }, OWNER, { shareLevel: "severe_only" })).body as { id: string; token: string };
  assert.equal((await post("/follow/:token/accept", { token: second.token }, INVITEE)).status, 200);
  assert.equal((await post("/profiles/:id/follow-invites/:inviteId/cancel", { id: profileId, inviteId: second.id }, OWNER)).status, 404);
  const { rows } = await pool.query("SELECT status FROM follow_relationships WHERE id = $1", [second.id]);
  assert.equal(rows[0].status, "accepted");
});

test("someone outside the circle can't cancel either kind", async () => {
  const invite = await managerInvite();
  const follow = (await post("/profiles/:id/follow-invites", { id: profileId }, OWNER, { shareLevel: "all" })).body as { id: string };
  const stranger = randomUUID();
  assert.equal((await post("/profiles/:id/manager-invites/:inviteId/cancel", { id: profileId, inviteId: invite.id }, stranger)).status, 404);
  assert.equal((await post("/profiles/:id/follow-invites/:inviteId/cancel", { id: profileId, inviteId: follow.id }, stranger)).status, 404);
});

test("the circle says who sent each pending invite, by display name only", async () => {
  const follow = (await post("/profiles/:id/follow-invites", { id: profileId }, CO_MANAGER, { shareLevel: "all" })).body as { id: string };
  const invite = await managerInvite();
  const { body } = await get("/profiles/:id/circle", { id: profileId }, OWNER);
  const circle = body as {
    pendingFollows: Record<string, unknown>[];
    pendingManagerInvites: Record<string, unknown>[];
  };
  const f = circle.pendingFollows.find((p) => p.id === follow.id)!;
  const m = circle.pendingManagerInvites.find((p) => p.id === invite.id)!;
  assert.equal(f.sent_by_id, CO_MANAGER);
  assert.equal(f.sent_by_name, "Co Judge");
  assert.equal(m.sent_by_id, OWNER);
  assert.equal(m.sent_by_name, "Sam Owner");
  for (const row of [f, m]) assert.ok(!Object.values(row).some((v) => String(v).includes("@")), "no email");
});
