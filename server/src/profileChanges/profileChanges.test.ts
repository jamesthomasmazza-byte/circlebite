import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { after, test } from "node:test";

import { deleteAccount } from "../account/deleteAccount.js";
import { pool } from "../db/pool.js";

// Real Postgres, same discipline as deleteAccount.test.ts. These exercise the database triggers
// directly (migration 0036 onward) — the guarantee under test is that the history is written by the
// database from the actual row, whatever path made the change, so most of these deliberately go
// around the routes.

const usersToClean = new Set<string>();
// Corrections outlive their scan, profile and reporter (migration 0020), so they're cleaned by id.
const correctionsToClean = new Set<string>();

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
  await pool.query("DELETE FROM product_corrections WHERE id = ANY($1)", [[...correctionsToClean]]);
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
  for (const kind of ["allergen_added", "allergen_edited", "allergen_removed", "downgrade_reported", "profile_edited"]) {
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

// ---- Append-only (migration 0039) ----

test("an entry can't be updated, deleted or truncated while its profile exists", async () => {
  const owner = await makeUser("Owner");
  const profile = await makeProfile(owner);
  await addAllergen(owner, profile, "Peanut");

  const refused = (err: { code?: string; message?: string }) => {
    assert.equal(err.code, "42501", `expected the append-only guard, got ${err.code}: ${err.message}`);
    assert.match(err.message ?? "", /append-only/);
    return true;
  };
  await assert.rejects(
    pool.query("UPDATE profile_changes SET actor_name = 'Someone else' WHERE allergen_profile_id = $1", [profile]),
    refused,
  );
  await assert.rejects(pool.query("DELETE FROM profile_changes WHERE allergen_profile_id = $1", [profile]), refused);
  // Inside transactions that are rolled back, so a guard failure here can't wipe the dev database.
  // A plain TRUNCATE is refused by Postgres itself once profile_change_acks references this table
  // (migration 0040). TRUNCATE ... CASCADE gets past that — it would empty both tables — and is
  // the case the guard's own trigger has to stop.
  for (const [sql, check] of [
    ["TRUNCATE profile_changes", (err: { code?: string }) => err.code === "0A000" || refused(err)],
    ["TRUNCATE profile_changes CASCADE", refused],
  ] as const) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await assert.rejects(client.query(sql), check);
    } finally {
      await client.query("ROLLBACK");
      client.release();
    }
  }

  const [entry] = await changesFor(profile);
  assert.equal(entry!.actor_name, "Owner");
});

test("deleting the owner's account cascades the history away with the profile", async () => {
  const owner = await makeUser("Owner");
  const profile = await makeProfile(owner);
  await addAllergen(owner, profile, "Peanut");

  await pool.query("DELETE FROM users WHERE id = $1", [owner]);

  assert.equal((await changesFor(profile)).length, 0);
});

test("a co-manager deleting their account leaves their entries, name included, on the owner's profile", async () => {
  const owner = await makeUser("Owner");
  const coManager = await makeUser("Co Sam");
  const profile = await makeProfile(owner);
  await pool.query("INSERT INTO profile_managers (allergen_profile_id, user_id) VALUES ($1, $2)", [profile, coManager]);
  await addAllergen(coManager, profile, "Peanut");

  await deleteAccount(coManager);

  const [entry] = await changesFor(profile);
  assert.equal(entry!.actor_id, coManager);
  assert.equal(entry!.actor_name, "Co Sam");
  assert.equal(entry!.actor_role, "co_manager");
});

test("deleting a whole profile cascades through its allergens and history without error", async () => {
  const owner = await makeUser("Owner");
  const profile = await makeProfile(owner);
  await addAllergen(owner, profile, "Soy");
  await addAllergen(owner, profile, "Fish");

  await asActor(owner, "DELETE FROM allergen_profiles WHERE id = $1", [profile]);

  assert.equal((await changesFor(profile)).length, 0);
});

// ---- Profile edits (migration 0038) ----

test("editing a profile's note, label or trace default is recorded with the full before and after", async () => {
  const owner = await makeUser("Owner");
  const coManager = await makeUser("Co Sam");
  const profile = await makeProfile(owner);
  await pool.query("INSERT INTO profile_managers (allergen_profile_id, user_id) VALUES ($1, $2)", [profile, coManager]);
  await asActor(owner, "UPDATE allergen_profiles SET notes = 'carries EpiPen 💉' WHERE id = $1", [profile]);

  await asActor(coManager, "UPDATE allergen_profiles SET notes = NULL, default_treat_traces_as_unsafe = false WHERE id = $1", [profile]);

  const edits = (await changesFor(profile)).filter((c) => c.kind === "profile_edited");
  assert.equal(edits.length, 2);
  assert.equal(edits[1]!.actor_role, "co_manager");
  assert.deepEqual(edits[1]!.before, { label: "Test Child", notes: "carries EpiPen 💉", default_treat_traces_as_unsafe: true });
  assert.deepEqual(edits[1]!.after, { label: "Test Child", notes: null, default_treat_traces_as_unsafe: false });
});

test("an ownership transfer or a bare updated_at bump on a profile writes nothing", async () => {
  const owner = await makeUser("Owner");
  const coManager = await makeUser("Co Sam");
  const profile = await makeProfile(owner);

  await asActor(owner, "UPDATE allergen_profiles SET updated_at = now() WHERE id = $1", [profile]);
  await pool.query("UPDATE allergen_profiles SET manager_id = $2 WHERE id = $1", [profile, coManager]);

  assert.equal((await changesFor(profile)).length, 0);
});

test("a 10k-character profile note still saves and is recorded", async () => {
  const owner = await makeUser("Owner");
  const profile = await makeProfile(owner);
  const longNote = "שלום 🥜 ".repeat(1500);

  await asActor(owner, "UPDATE allergen_profiles SET notes = $2 WHERE id = $1", [profile, longNote]);

  const [edit] = await changesFor(profile);
  assert.equal(edit!.after!.notes, longNote);
});

// ---- Downgrades (migration 0037) ----

async function makeScan(profileId: string, productName: string | null = "Crunch Bars"): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO scans (allergen_profile_id, barcode, product_name, product_brand, result, matched_allergens)
     VALUES ($1, $2, $3, 'Acme', 'contains_allergen', '[]') RETURNING id`,
    [profileId, `0000${randomBytes(4).toString("hex")}`, productName],
  );
  return rows[0]!.id;
}

async function fileCorrection(
  scanId: string | null,
  reportedBy: string | null,
  correctionType: "flag_wrong" | "flag_missing" | "wrong_product",
  opts: { allergen?: string | null; note?: string | null; barcode?: string } = {},
): Promise<string> {
  const direction = correctionType === "flag_missing" ? "add_caution" : "remove_caution";
  const allergen = correctionType === "wrong_product" ? null : (opts.allergen ?? "Peanut");
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO product_corrections
       (scan_id, barcode, reported_by, correction_type, direction, allergen, target, verdict_at_report, note, photo_path)
     VALUES ($1, $2, $3, $4, $5, $6, 'off_data', 'contains_allergen', $7, 'evidence.jpg')
     RETURNING id`,
    [scanId, opts.barcode ?? `9999${randomBytes(4).toString("hex")}`, reportedBy, correctionType, direction, allergen, opts.note ?? null],
  );
  correctionsToClean.add(rows[0]!.id);
  return rows[0]!.id;
}

async function downgradesFor(profileId: string) {
  const { rows } = await pool.query(
    `SELECT kind, actor_id, actor_name, actor_role, correction_id, correction_type, allergen, product_name,
            product_brand, verdict_at_report, note, photo_path, scan_created_at
     FROM profile_changes WHERE allergen_profile_id = $1 AND kind = 'downgrade_reported' ORDER BY created_at, seq`,
    [profileId],
  );
  return rows;
}

test("a co-manager's downgrade is recorded with who, when and the evidence, snapshotted from the report and scan", async () => {
  const owner = await makeUser("Owner");
  const coManager = await makeUser("Co Sam");
  const profile = await makeProfile(owner);
  await pool.query("INSERT INTO profile_managers (allergen_profile_id, user_id) VALUES ($1, $2)", [profile, coManager]);
  const scan = await makeScan(profile);

  const correctionId = await fileCorrection(scan, coManager, "flag_wrong", { note: "label says made in a nut-free facility" });

  const [entry] = await downgradesFor(profile);
  assert.equal(entry.actor_id, coManager);
  assert.equal(entry.actor_name, "Co Sam");
  assert.equal(entry.actor_role, "co_manager");
  assert.equal(entry.correction_id, correctionId);
  assert.equal(entry.correction_type, "flag_wrong");
  assert.equal(entry.allergen, "Peanut");
  assert.equal(entry.product_name, "Crunch Bars");
  assert.equal(entry.product_brand, "Acme");
  assert.equal(entry.verdict_at_report, "contains_allergen");
  assert.equal(entry.note, "label says made in a nut-free facility");
  assert.equal(entry.photo_path, "evidence.jpg");
  assert.ok(entry.scan_created_at instanceof Date);
});

test("a wrong_product downgrade is recorded with no allergen; an escalation is not recorded at all", async () => {
  const owner = await makeUser("Owner");
  const profile = await makeProfile(owner);
  const scan = await makeScan(profile);

  await fileCorrection(scan, owner, "wrong_product");
  await fileCorrection(scan, owner, "flag_missing");

  const entries = await downgradesFor(profile);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].correction_type, "wrong_product");
  assert.equal(entries[0].allergen, null);
  assert.equal(entries[0].actor_role, "owner");
});

test("a downgrade's entry survives its scan being deleted, still saying what it was about", async () => {
  const owner = await makeUser("Owner");
  const profile = await makeProfile(owner);
  const scan = await makeScan(profile);
  await fileCorrection(scan, owner, "flag_wrong");

  await pool.query("DELETE FROM scans WHERE id = $1", [scan]);

  const [entry] = await downgradesFor(profile);
  assert.equal(entry.product_name, "Crunch Bars");
  assert.equal(entry.photo_path, "evidence.jpg");
});

test("a downgrade with no resolvable scan is still accepted — the trigger writes nothing rather than blocking the report", async () => {
  const owner = await makeUser("Owner");

  const correctionId = await fileCorrection(null, owner, "flag_wrong");

  const { rows } = await pool.query("SELECT id FROM product_corrections WHERE id = $1", [correctionId]);
  assert.equal(rows.length, 1, "the report itself went through");
  // Scoped to this report's own id — there's no profile to scope to, and a global count would
  // depend on no other test writing a downgrade concurrently.
  const entries = await pool.query("SELECT 1 FROM profile_changes WHERE correction_id = $1", [correctionId]);
  assert.equal(entries.rows.length, 0);
});

test("hostile downgrade content — a 10k note, emoji and RTL text, a reporter whose account is gone — still goes through", async () => {
  const owner = await makeUser("Owner");
  const profile = await makeProfile(owner);
  const scan = await makeScan(profile, "חטיף 🥜 بادام");
  const longNote = "n".repeat(10_000);

  // reported_by has an FK to users, so a non-user reporter can't exist at insert; NULL (a reporter
  // whose account is gone) is the realistic hostile case.
  await fileCorrection(scan, null, "flag_wrong", { note: longNote, allergen: "Sesame 🌱 سمسم" });

  const [entry] = await downgradesFor(profile);
  assert.equal(entry.note, longNote);
  assert.equal(entry.allergen, "Sesame 🌱 سمسم");
  assert.equal(entry.product_name, "חטיף 🥜 بادام");
  assert.equal(entry.actor_id, null);
  assert.equal(entry.actor_name, null);
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
