import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { after, test } from "node:test";

import { pool } from "../db/pool.js";

// Real Postgres, same discipline as deleteAccount.test.ts. These exercise the database triggers
// directly (migration 0036 onward) — the guarantee under test is that the history is written by the
// database from the actual row, whatever path made the change, so most of these deliberately go
// around the routes.

const usersToClean = new Set<string>();

async function makeUser(displayName: string): Promise<string> {
  const id = randomUUID();
  await pool.query(
    `INSERT INTO users (id, email, password_hash, display_name, age_attested_adult, age_attested_at)
     VALUES ($1, $2, 'x', $3, true, now())`,
    [id, `${id}@example.test`, displayName],
  );
  usersToClean.add(id);
  return id;
}

async function makeProfile(ownerId: string): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    "INSERT INTO allergen_profiles (manager_id, label) VALUES ($1, 'Test Child') RETURNING id",
    [ownerId],
  );
  return rows[0]!.id;
}

/** Runs sql in one transaction with circlebite.actor_id set to `actor` (verbatim — the hostile
 *  tests pass things that aren't uuids), or unset when actor is undefined. */
async function asActor<T = unknown>(actor: string | undefined, sql: string, params: unknown[] = []): Promise<T[]> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    if (actor !== undefined) await client.query("SELECT set_config('circlebite.actor_id', $1, true)", [actor]);
    const { rows } = await client.query(sql, params);
    await client.query("COMMIT");
    return rows as T[];
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

async function addAllergen(actor: string | undefined, profileId: string, name: string, notes: string | null = null): Promise<string> {
  const rows = await asActor<{ id: string }>(
    actor,
    `INSERT INTO allergens (allergen_profile_id, name, severity, notes, treat_traces_as_unsafe)
     VALUES ($1, $2, 'severe', $3, true) RETURNING id`,
    [profileId, name, notes],
  );
  return rows[0]!.id;
}

type ChangeRow = {
  kind: string;
  actor_id: string | null;
  actor_name: string | null;
  actor_role: string | null;
  allergen_id: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
};

async function changesFor(profileId: string): Promise<ChangeRow[]> {
  const { rows } = await pool.query<ChangeRow>(
    `SELECT kind, actor_id, actor_name, actor_role, allergen_id, before, after
     FROM profile_changes WHERE allergen_profile_id = $1 ORDER BY created_at, seq`,
    [profileId],
  );
  return rows;
}

after(async () => {
  // Deleting the owner cascades their profiles, which cascades allergens and profile_changes.
  await pool.query("DELETE FROM users WHERE id = ANY($1)", [[...usersToClean]]);
  await pool.end();
});

// ---- The kind constraint ----

test("profile_changes has exactly one CHECK on kind, and it admits every kind the triggers write", async () => {
  const { rows } = await pool.query<{ conname: string; def: string }>(
    `SELECT conname, pg_get_constraintdef(oid) AS def FROM pg_constraint
     WHERE conrelid = 'profile_changes'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) LIKE '%kind%'`,
  );
  assert.equal(rows.length, 1, `expected one CHECK on kind, found: ${rows.map((r) => r.conname).join(", ")}`);
  assert.equal(rows[0]!.conname, "profile_changes_kind_check");
  // Every kind a trigger can write. Extend this alongside any migration that adds one — a kind the
  // constraint rejects fails the trigger and rolls back the parent's edit.
  for (const kind of ["allergen_added", "allergen_edited", "allergen_removed"]) {
    assert.ok(rows[0]!.def.includes(`'${kind}'`), `constraint must admit ${kind}: ${rows[0]!.def}`);
  }
});

// ---- Capture ----

test("adding, editing and removing an allergen each write one entry from the actual row, attributed to the actor", async () => {
  const owner = await makeUser("Owner Ada");
  const profile = await makeProfile(owner);

  const allergenId = await addAllergen(owner, profile, "Peanut", "carries EpiPen");
  await asActor(owner, "UPDATE allergens SET treat_traces_as_unsafe = false WHERE id = $1", [allergenId]);
  await asActor(owner, "DELETE FROM allergens WHERE id = $1", [allergenId]);

  const changes = await changesFor(profile);
  assert.deepEqual(changes.map((c) => c.kind), ["allergen_added", "allergen_edited", "allergen_removed"]);
  for (const c of changes) {
    assert.equal(c.actor_id, owner);
    assert.equal(c.actor_name, "Owner Ada");
    assert.equal(c.actor_role, "owner");
    assert.equal(c.allergen_id, allergenId);
  }
  const full = { name: "Peanut", severity: "severe", notes: "carries EpiPen", treat_traces_as_unsafe: true };
  assert.deepEqual(changes[0]!.after, full);
  assert.equal(changes[0]!.before, null);
  assert.deepEqual(changes[1]!.before, full);
  assert.deepEqual(changes[1]!.after, { ...full, treat_traces_as_unsafe: false });
  // A removed allergen is still fully legible after its row is gone.
  assert.deepEqual(changes[2]!.before, { ...full, treat_traces_as_unsafe: false });
  assert.equal(changes[2]!.after, null);
});

test("a co-manager's change is recorded with role co_manager", async () => {
  const owner = await makeUser("Owner");
  const coManager = await makeUser("Co Sam");
  const profile = await makeProfile(owner);
  await pool.query("INSERT INTO profile_managers (allergen_profile_id, user_id) VALUES ($1, $2)", [profile, coManager]);

  await addAllergen(coManager, profile, "Sesame");

  const [change] = await changesFor(profile);
  assert.equal(change!.actor_role, "co_manager");
  assert.equal(change!.actor_name, "Co Sam");
});

test("changes made inside one transaction come back in the order they happened", async () => {
  const owner = await makeUser("Owner");
  const profile = await makeProfile(owner);

  // The judge seed's shape: many allergens in one transaction. now() would give them all the same
  // created_at and the history would order them by whatever the tiebreak happened to be.
  const names = Array.from({ length: 12 }, (_, i) => `Allergen ${String(i).padStart(2, "0")}`);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('circlebite.actor_id', $1, true)", [owner]);
    for (const name of names) {
      await client.query(
        "INSERT INTO allergens (allergen_profile_id, name, severity, treat_traces_as_unsafe) VALUES ($1, $2, 'mild', true)",
        [profile, name],
      );
    }
    // And one multi-row statement, where consecutive trigger firings can share a microsecond.
    await client.query(
      `INSERT INTO allergens (allergen_profile_id, name, severity, treat_traces_as_unsafe)
       SELECT $1, 'Batch ' || g, 'mild', true FROM generate_series(1, 5) g ORDER BY g`,
      [profile],
    );
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }

  const expected = [...names, ...[1, 2, 3, 4, 5].map((g) => `Batch ${g}`)];
  // Several reads, as a page reloading would — the order must be the same every time.
  for (let i = 0; i < 3; i++) {
    assert.deepEqual((await changesFor(profile)).map((c) => c.after!.name), expected);
  }
  const { rows } = await pool.query<{ distinct_times: number }>(
    "SELECT count(DISTINCT created_at)::int AS distinct_times FROM profile_changes WHERE allergen_profile_id = $1",
    [profile],
  );
  assert.ok(rows[0]!.distinct_times > 1, "created_at must be per-row time, not the transaction's start");
});

test("an update that changes none of the recorded columns writes nothing", async () => {
  const owner = await makeUser("Owner");
  const profile = await makeProfile(owner);
  const allergenId = await addAllergen(owner, profile, "Milk");

  // Exactly what the PATCH route does on a save with no differences: updated_at moves, nothing else.
  await asActor(owner, "UPDATE allergens SET severity = severity, updated_at = now() WHERE id = $1", [allergenId]);

  assert.deepEqual((await changesFor(profile)).map((c) => c.kind), ["allergen_added"]);
});

test("a change that rolls back leaves no entry", async () => {
  const owner = await makeUser("Owner");
  const profile = await makeProfile(owner);
  const allergenId = await addAllergen(owner, profile, "Egg");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('circlebite.actor_id', $1, true)", [owner]);
    await client.query("DELETE FROM allergens WHERE id = $1", [allergenId]);
    await client.query("ROLLBACK");
  } finally {
    client.release();
  }

  assert.deepEqual((await changesFor(profile)).map((c) => c.kind), ["allergen_added"]);
});

test("a change made with no actor (psql, the deploy window) is recorded with actor NULL, not guessed", async () => {
  const owner = await makeUser("Owner");
  const profile = await makeProfile(owner);
  const allergenId = await addAllergen(owner, profile, "Wheat");

  await pool.query("DELETE FROM allergens WHERE id = $1", [allergenId]);

  const removed = (await changesFor(profile)).at(-1)!;
  assert.equal(removed.kind, "allergen_removed");
  assert.equal(removed.actor_id, null);
  assert.equal(removed.actor_name, null);
  assert.equal(removed.actor_role, null);
});

test("deleting a whole profile cascades through its allergens and history without error", async () => {
  const owner = await makeUser("Owner");
  const profile = await makeProfile(owner);
  await addAllergen(owner, profile, "Soy");
  await addAllergen(owner, profile, "Fish");

  await asActor(owner, "DELETE FROM allergen_profiles WHERE id = $1", [profile]);

  assert.equal((await changesFor(profile)).length, 0);
});

// ---- Hostile input: every one of these must let the edit through, and record it ----

test("hostile allergen content still goes through and is recorded verbatim", async () => {
  const owner = await makeUser("Owner");
  const profile = await makeProfile(owner);

  const names = [
    "Peanut 🥜🥜 (anaphylaxis)",
    "سمسم — sesame",
    "שומשום",
    "Crème fraîche",
    // ~2,000 bytes, multibyte, under the lower(name) index's ~2.7KB limit.
    "Ж".repeat(1000),
  ];
  for (const name of names) await addAllergen(owner, profile, name);
  const nullNote = await addAllergen(owner, profile, "Null note", null);
  const longNote = "x".repeat(10_000);
  await asActor(owner, "UPDATE allergens SET notes = $2 WHERE id = $1", [nullNote, longNote]);

  const changes = await changesFor(profile);
  assert.deepEqual(
    changes.filter((c) => c.kind === "allergen_added").map((c) => c.after!.name),
    [...names, "Null note"],
  );
  const edited = changes.find((c) => c.kind === "allergen_edited")!;
  assert.equal(edited.before!.notes, null);
  assert.equal(edited.after!.notes, longNote);
});

test("a name too long for the existing name index is refused by the index, not the trigger", async () => {
  const owner = await makeUser("Owner");
  const profile = await makeProfile(owner);
  // Incompressible, so Postgres can't squeeze the index entry under the btree limit.
  const tooLong = randomBytes(4500).toString("base64");

  await assert.rejects(addAllergen(owner, profile, tooLong), (err: { code?: string; message?: string }) => {
    assert.equal(err.code, "54000", `expected program_limit_exceeded from the index, got ${err.code}: ${err.message}`);
    assert.match(err.message ?? "", /index row/);
    return true;
  });
  assert.equal((await changesFor(profile)).length, 0);
});

test("an actor setting that is garbage, empty, or a uuid with no user records the change with actor NULL or nameless — never fails it", async () => {
  const owner = await makeUser("Owner");
  const profile = await makeProfile(owner);
  const ghost = randomUUID();

  await addAllergen("not-a-uuid'; DROP TABLE allergens; --", profile, "Garbage actor");
  await addAllergen("", profile, "Empty actor");
  await addAllergen(ghost, profile, "Ghost actor");

  const [garbage, empty, ghostChange] = await changesFor(profile);
  assert.equal(garbage!.actor_id, null);
  assert.equal(empty!.actor_id, null);
  assert.equal(ghostChange!.actor_id, ghost);
  assert.equal(ghostChange!.actor_name, null);
  assert.equal(ghostChange!.actor_role, null);
});
