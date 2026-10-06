import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";

import { deleteAccount } from "../account/deleteAccount.js";
import { pool } from "../db/pool.js";
import { withActor } from "../lib/withActor.js";
import { acknowledgeChanges, loadUnseenChanges } from "./acks.js";

// Real Postgres. Each test builds its own owner, so loadUnseenChanges(owner) only ever sees that
// test's profiles — no count here depends on what another test wrote.

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

async function makeCircle(): Promise<{ owner: string; coManager: string; profile: string }> {
  const owner = await makeUser("Owner");
  const coManager = await makeUser("Co Sam");
  const { rows } = await pool.query<{ id: string }>(
    "INSERT INTO allergen_profiles (manager_id, label) VALUES ($1, 'Test Child') RETURNING id",
    [owner],
  );
  const profile = rows[0]!.id;
  await pool.query("INSERT INTO profile_managers (allergen_profile_id, user_id) VALUES ($1, $2)", [profile, coManager]);
  return { owner, coManager, profile };
}

async function addAllergen(actor: string, profile: string, name: string): Promise<void> {
  await withActor(actor, (client) =>
    client.query(
      "INSERT INTO allergens (allergen_profile_id, name, severity, treat_traces_as_unsafe) VALUES ($1, $2, 'severe', true)",
      [profile, name],
    ),
  );
}

async function changeIds(profile: string): Promise<string[]> {
  const { rows } = await pool.query<{ id: string }>(
    "SELECT id FROM profile_changes WHERE allergen_profile_id = $1 ORDER BY created_at, seq",
    [profile],
  );
  return rows.map((r) => r.id);
}

after(async () => {
  await pool.query("DELETE FROM users WHERE id = ANY($1)", [[...usersToClean]]);
  await pool.end();
});

test("the owner's own change isn't unseen; a co-manager's is, until the owner acknowledges it", async () => {
  const { owner, coManager, profile } = await makeCircle();
  await addAllergen(owner, profile, "Peanut");
  assert.deepEqual(await loadUnseenChanges(owner), []);

  await addAllergen(coManager, profile, "Sesame");
  assert.deepEqual(await loadUnseenChanges(owner), [{ profileId: profile, label: "Test Child", count: 1 }]);
  // The co-manager never gets a banner.
  assert.deepEqual(await loadUnseenChanges(coManager), []);

  assert.equal(await acknowledgeChanges(owner, profile, await changeIds(profile)), 2);
  assert.deepEqual(await loadUnseenChanges(owner), []);
  assert.equal(await acknowledgeChanges(owner, profile, await changeIds(profile)), 0, "repeating an ack is a no-op");
});

test("a change made outside the app counts as unseen for the owner", async () => {
  const { owner, profile } = await makeCircle();
  await pool.query(
    "INSERT INTO allergens (allergen_profile_id, name, severity, treat_traces_as_unsafe) VALUES ($1, 'Milk', 'mild', true)",
    [profile],
  );
  assert.equal((await loadUnseenChanges(owner))[0]?.count, 1);
});

test("a change that commits after the owner looked, with an earlier timestamp, is still unseen after they acknowledge", async () => {
  const { owner, coManager, profile } = await makeCircle();

  // Change B starts first — its created_at is earlier — but doesn't commit yet.
  const slow = await pool.connect();
  try {
    await slow.query("BEGIN");
    await slow.query("SELECT set_config('circlebite.actor_id', $1, true)", [coManager]);
    await slow.query(
      "INSERT INTO allergens (allergen_profile_id, name, severity, treat_traces_as_unsafe) VALUES ($1, 'Late Wheat', 'severe', true)",
      [profile],
    );

    // Change A commits; the owner sees exactly that and acknowledges it.
    await addAllergen(coManager, profile, "Soy");
    const shown = await changeIds(profile);
    assert.equal(shown.length, 1);
    await acknowledgeChanges(owner, profile, shown);
    assert.deepEqual(await loadUnseenChanges(owner), []);

    await slow.query("COMMIT");
  } finally {
    slow.release();
  }

  // A "seen up to" cursor at A's timestamp would have swallowed B. Per-row acks can't.
  assert.equal((await loadUnseenChanges(owner))[0]?.count, 1);
});

test("an ack only lands on entries of the named profile; malformed ids are ignored, not a crash", async () => {
  const a = await makeCircle();
  const b = await makeCircle();
  await addAllergen(a.coManager, a.profile, "Peanut");
  await addAllergen(b.coManager, b.profile, "Peanut");

  // Owner A tries to acknowledge B's entry through A's profile, plus garbage.
  const recorded = await acknowledgeChanges(a.owner, a.profile, [...(await changeIds(b.profile)), "not-a-uuid", ""]);
  assert.equal(recorded, 0);
  assert.equal((await loadUnseenChanges(a.owner))[0]?.count, 1);
});

test("when the owner deletes their account, the co-manager who inherits the profile inherits its unseen backlog", async () => {
  const { owner, coManager, profile } = await makeCircle();
  const third = await makeUser("Third");
  await pool.query("INSERT INTO profile_managers (allergen_profile_id, user_id, added_at) VALUES ($1, $2, now() + interval '1 day')", [
    profile,
    third,
  ]);
  await addAllergen(third, profile, "Fish");
  await addAllergen(coManager, profile, "Egg");

  await deleteAccount(owner);

  // coManager is the longest-standing co-manager, so now owns it: Third's change is unseen for
  // them, their own isn't.
  assert.deepEqual(await loadUnseenChanges(coManager), [{ profileId: profile, label: "Test Child", count: 1 }]);
});
