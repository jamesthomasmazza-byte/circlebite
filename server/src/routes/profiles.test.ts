import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";

import { loadUnseenChanges } from "../profileChanges/acks.js";
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

function call(method: "get" | "post" | "patch" | "delete", path: string, params: Record<string, string>, body: unknown, userId: string): Promise<Captured> {
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
  const created = await call("post", "/", {}, { label: "Test Child", allergens: [{ key: "peanut", severity: "severe" }] }, OWNER);
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
  const added = await call("post", "/:id/allergens", { id: profileId }, { key: "sesame", severity: "moderate" }, CO_MANAGER);
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
    call("post", "/:id/allergens", { id: profileId }, { key: "peanut", severity: "mild" }, CO_MANAGER),
    (err: { status?: number; code?: string }) => err.status === 409 && err.code === "duplicate_allergen",
  );
  assert.deepEqual(await latestChange(), before);
});

// The guided pick-list (allergenChoices.ts, migration 0046; JT, 2026-10-23).

type AllergenRow = { id: string; name: string; allergen_key: string | null; key_needs_review: boolean };

async function insertTyped(name: string, key: string | null, needsReview: boolean): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO allergens (allergen_profile_id, name, severity, treat_traces_as_unsafe, allergen_key, key_needs_review)
     VALUES ($1, $2, 'severe', true, $3, $4) RETURNING id`,
    [profileId, name, key, needsReview],
  );
  return rows[0]!.id;
}

const listed = (err: { status?: number; code?: string; detail?: Record<string, unknown> }, key: string, displayName: string) =>
  err.status === 409 && err.code === "listed_allergen" && err.detail?.key === key && err.detail?.displayName === displayName;

test("a listed allergen is added by its key, under the list's own name", async () => {
  const added = await call("post", "/:id/allergens", { id: profileId }, { key: "tree-nut", severity: "severe" }, OWNER);
  assert.equal(added.status, 201);
  const row = added.body as AllergenRow;
  assert.deepEqual([row.name, row.allergen_key, row.key_needs_review], ["Tree nuts", "tree-nut", false]);
  await call("delete", "/:id/allergens/:allergenId", { id: profileId, allergenId: row.id }, undefined, OWNER);
});

test("free text that is a listed allergen is refused, naming the listed one — 'treenuts' can't come back", async () => {
  for (const name of ["treenuts", "Tree-Nuts", "tree nuts"]) {
    await assert.rejects(
      call("post", "/:id/allergens", { id: profileId }, { key: "other", name, severity: "severe" }, OWNER),
      (err: { status?: number; code?: string; detail?: Record<string, unknown> }) => listed(err, "tree-nut", "Tree nuts"),
      name,
    );
  }
  await assert.rejects(
    call("post", "/:id/allergens", { id: profileId }, { name: "Mustard", severity: "severe" }, OWNER),
    (err: { status?: number; code?: string }) => err.status === 400,
    "no key at all",
  );
});

test("Other keeps a name the list doesn't have, as typed, and needs no review", async () => {
  const added = await call("post", "/:id/allergens", { id: profileId }, { key: "other", name: " Mustard ", severity: "mild" }, OWNER);
  const row = added.body as AllergenRow;
  assert.deepEqual([row.name, row.allergen_key, row.key_needs_review], ["Mustard", "other", false]);
  await call("delete", "/:id/allergens/:allergenId", { id: profileId, allergenId: row.id }, undefined, OWNER);
});

test("a co-manager confirming 'treenuts' as Tree nuts renames it, is logged as theirs, and reaches the owner's banner", async () => {
  const allergenId = await insertTyped("treenuts", "tree-nut", true);
  const confirmed = await call("patch", "/:id/allergens/:allergenId", { id: profileId, allergenId }, { key: "tree-nut" }, CO_MANAGER);
  const row = confirmed.body as AllergenRow;
  assert.deepEqual([row.name, row.allergen_key, row.key_needs_review], ["Tree nuts", "tree-nut", false]);

  const { rows } = await pool.query(
    `SELECT kind, actor_id, actor_role, before->>'name' AS was, after->>'name' AS now FROM profile_changes
     WHERE allergen_profile_id = $1 ORDER BY created_at DESC, seq DESC LIMIT 1`,
    [profileId],
  );
  assert.deepEqual(rows[0], { kind: "allergen_edited", actor_id: CO_MANAGER, actor_role: "co_manager", was: "treenuts", now: "Tree nuts" });
  const owners = await loadUnseenChanges(OWNER);
  assert.ok(owners.some((u) => u.profileId === profileId), "in the owner's Changes to review");
  await call("delete", "/:id/allergens/:allergenId", { id: profileId, allergenId }, undefined, OWNER);
});

test("'Keep it as typed' settles an unlisted name with no history entry, and is refused for a listed spelling", async () => {
  const unlisted = await insertTyped("Ownertest", null, true);
  const before = await latestChange();
  const kept = await call("patch", "/:id/allergens/:allergenId", { id: profileId, allergenId: unlisted }, { key: "other" }, CO_MANAGER);
  const row = kept.body as AllergenRow;
  assert.deepEqual([row.name, row.allergen_key, row.key_needs_review], ["Ownertest", "other", false]);
  assert.deepEqual(await latestChange(), before, "nothing the history records changed");

  const listedSpelling = await insertTyped("treenuts", "tree-nut", true);
  await assert.rejects(
    call("patch", "/:id/allergens/:allergenId", { id: profileId, allergenId: listedSpelling }, { key: "other" }, CO_MANAGER),
    (err: { status?: number; code?: string; detail?: Record<string, unknown> }) => listed(err, "tree-nut", "Tree nuts"),
  );
  const { rows } = await pool.query<AllergenRow>("SELECT allergen_key, key_needs_review FROM allergens WHERE id = $1", [listedSpelling]);
  assert.deepEqual([rows[0]!.allergen_key, rows[0]!.key_needs_review], ["tree-nut", true], "still keyed, still waiting");

  for (const id of [unlisted, listedSpelling]) await call("delete", "/:id/allergens/:allergenId", { id: profileId, allergenId: id }, undefined, OWNER);
});

test("a rename needs a key: a bare name in a PATCH is refused", async () => {
  const { rows } = await pool.query<{ id: string }>("SELECT id FROM allergens WHERE allergen_profile_id = $1 LIMIT 1", [profileId]);
  await assert.rejects(
    call("patch", "/:id/allergens/:allergenId", { id: profileId, allergenId: rows[0]!.id }, { name: "treenuts" }, OWNER),
    (err: { status?: number }) => err.status === 400,
  );
});

test("the profile list names each profile's allergens, and a severe_only follower gets only the severe ones", async () => {
  const FULL = randomUUID();
  const SEVERE_ONLY = randomUUID();
  await pool.query(
    `INSERT INTO users (id, email, password_hash, display_name, age_attested_adult, age_attested_at)
     VALUES ($1, $3, 'x', 'Full Follower', true, now()), ($2, $4, 'x', 'Severe Follower', true, now())`,
    [FULL, SEVERE_ONLY, `${FULL}@example.test`, `${SEVERE_ONLY}@example.test`],
  );
  try {
    const created = await call(
      "post",
      "/",
      {},
      {
        label: "Names Child",
        allergens: [
          { key: "peanut", severity: "severe", notes: "carries an auto-injector" },
          { key: "sesame", severity: "mild" },
        ],
      },
      OWNER,
    );
    const id = (created.body as { id: string }).id;
    await pool.query(
      `INSERT INTO follow_relationships (allergen_profile_id, follower_id, token_hash, status, share_level)
       VALUES ($1, $2, $4, 'accepted', 'all'), ($1, $3, $5, 'accepted', 'severe_only')`,
      [id, FULL, SEVERE_ONLY, randomUUID(), randomUUID()],
    );

    type List = { managed: { id: string; allergen_names: string[] }[]; followed: { id: string; allergen_names: string[] }[] };
    const names = async (userId: string, side: "managed" | "followed") =>
      ((await call("get", "/", {}, undefined, userId)).body as List)[side].find((p) => p.id === id)!.allergen_names;

    assert.deepEqual(await names(OWNER, "managed"), ["Peanut", "Sesame"]);
    assert.deepEqual(await names(FULL, "followed"), ["Peanut", "Sesame"]);
    assert.deepEqual(await names(SEVERE_ONLY, "followed"), ["Peanut"]);

    const listed = JSON.stringify((await call("get", "/", {}, undefined, OWNER)).body);
    assert.ok(!listed.includes("auto-injector"), "notes never reach the list");
    assert.ok(!listed.includes('"severity"'), "severities never reach the list");
  } finally {
    await pool.query("DELETE FROM allergen_profiles WHERE manager_id = $1 AND label = 'Names Child'", [OWNER]);
    await pool.query("DELETE FROM users WHERE id = ANY($1)", [[FULL, SEVERE_ONLY]]);
  }
});
