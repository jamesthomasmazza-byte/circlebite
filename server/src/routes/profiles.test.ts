import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";

import { pool } from "../db/pool.js";
import { profilesRouter } from "./profiles.js";

// No HTTP harness (see corrections.test.ts): this finds each route's handler on the router and calls
// it with a fake req/res, past the router-level requireAuth. Everything from there runs for real
// against Postgres — the point is that each write path attributes its history entry to the
// signed-in user, through withActor, rather than recording it as made outside the app.

const OWNER = randomUUID();
const CO_MANAGER = randomUUID();
let profileId: string;

type Captured = { status: number; body: unknown };

function call(method: "post" | "patch" | "delete", path: string, params: Record<string, string>, body: unknown, userId: string): Promise<Captured> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const layer = (profilesRouter as any).stack.find((l: any) => l.route?.path === path && l.route.methods[method]);
  assert.ok(layer, `expected a registered ${method.toUpperCase()} ${path} route`);
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
        resolve({ status, body: undefined });
      },
    };
    handler({ params, body, user: { id: userId } }, res, (err: unknown) =>
      reject(err ?? new Error("handler called next() without responding")),
    );
  });
}

async function latestChange(): Promise<{ kind: string; actor_id: string | null; actor_role: string | null } | undefined> {
  const { rows } = await pool.query(
    "SELECT kind, actor_id, actor_role FROM profile_changes WHERE allergen_profile_id = $1 ORDER BY created_at DESC, seq DESC LIMIT 1",
    [profileId],
  );
  return rows[0];
}

before(async () => {
  await pool.query(
    `INSERT INTO users (id, email, password_hash, display_name, age_attested_adult, age_attested_at)
     VALUES ($1, $3, 'x', 'Owner', true, now()), ($2, $4, 'x', 'Co Sam', true, now())`,
    [OWNER, CO_MANAGER, `${OWNER}@example.test`, `${CO_MANAGER}@example.test`],
  );
  const created = await call("post", "/", {}, { label: "Test Child", allergens: [{ name: "Peanut", severity: "severe" }] }, OWNER);
  assert.equal(created.status, 201);
  profileId = (created.body as { id: string }).id;
  await pool.query("INSERT INTO profile_managers (allergen_profile_id, user_id) VALUES ($1, $2)", [profileId, CO_MANAGER]);
});

after(async () => {
  await pool.query("DELETE FROM users WHERE id = ANY($1)", [[OWNER, CO_MANAGER]]);
  await pool.end();
});

test("creating a profile with allergens attributes each to the owner", async () => {
  const { rows } = await pool.query(
    "SELECT kind, actor_id, actor_role FROM profile_changes WHERE allergen_profile_id = $1 AND kind = 'allergen_added'",
    [profileId],
  );
  assert.deepEqual(rows, [{ kind: "allergen_added", actor_id: OWNER, actor_role: "owner" }]);
});

test("a co-manager's add, edit and delete through the routes are each attributed to them", async () => {
  const added = await call("post", "/:id/allergens", { id: profileId }, { name: "Sesame", severity: "moderate" }, CO_MANAGER);
  assert.equal(added.status, 201);
  assert.deepEqual(await latestChange(), { kind: "allergen_added", actor_id: CO_MANAGER, actor_role: "co_manager" });

  const allergenId = (added.body as { id: string }).id;
  const edited = await call("patch", "/:id/allergens/:allergenId", { id: profileId, allergenId }, { treatTracesAsUnsafe: false }, CO_MANAGER);
  assert.equal(edited.status, 200);
  assert.deepEqual(await latestChange(), { kind: "allergen_edited", actor_id: CO_MANAGER, actor_role: "co_manager" });

  const deleted = await call("delete", "/:id/allergens/:allergenId", { id: profileId, allergenId }, undefined, CO_MANAGER);
  assert.equal(deleted.status, 204);
  assert.deepEqual(await latestChange(), { kind: "allergen_removed", actor_id: CO_MANAGER, actor_role: "co_manager" });
});

test("a co-manager's profile note edit through the route is attributed to them", async () => {
  const patched = await call("patch", "/:id", { id: profileId }, { notes: "carries EpiPen" }, CO_MANAGER);
  assert.equal(patched.status, 200);
  assert.deepEqual(await latestChange(), { kind: "profile_edited", actor_id: CO_MANAGER, actor_role: "co_manager" });
});

test("a duplicate allergen is still a 409 and leaves no entry", async () => {
  const before = await latestChange();
  await assert.rejects(
    call("post", "/:id/allergens", { id: profileId }, { name: "peanut", severity: "mild" }, CO_MANAGER),
    (err: { status?: number; code?: string }) => err.status === 409 && err.code === "duplicate_allergen",
  );
  assert.deepEqual(await latestChange(), before);
});
