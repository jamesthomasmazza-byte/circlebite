import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";

import { pool } from "../db/pool.js";
import { revokeAllSessions, revokeOtherSessions } from "./session.js";

// Real Postgres, same discipline as deleteAccount.test.ts: each test seeds and cleans up its own
// fixture rather than sharing one.

const usersToClean = new Set<string>();

async function makeUser(idSuffix: string, email: string): Promise<string> {
  const id = `88880000-0000-0000-0000-${idSuffix}`;
  await pool.query(
    `INSERT INTO users (id, email, password_hash, display_name, age_attested_adult, age_attested_at)
     VALUES ($1, $2, 'x', $2, true, now())`,
    [id, email],
  );
  usersToClean.add(id);
  return id;
}

async function makeSession(userId: string, revokedAt: Date | null = null): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO sessions (user_id, token_hash, expires_at, revoked_at)
     VALUES ($1, $2, now() + interval '30 days', $3)
     RETURNING id`,
    [userId, randomUUID(), revokedAt],
  );
  return rows[0].id;
}

async function revokedAtOf(sessionId: string): Promise<Date | null> {
  const { rows } = await pool.query<{ revoked_at: Date | null }>(
    "SELECT revoked_at FROM sessions WHERE id = $1",
    [sessionId],
  );
  return rows[0].revoked_at;
}

after(async () => {
  await pool.query("DELETE FROM users WHERE id = ANY($1)", [[...usersToClean]]);
  await pool.end();
});

test("revokeOtherSessions revokes every session for the user except the excluded one, and leaves other users' sessions untouched", async () => {
  const userA = await makeUser("100000000001", "session-a-1@example.com");
  const userB = await makeUser("100000000002", "session-b-1@example.com");

  const current = await makeSession(userA);
  const other1 = await makeSession(userA);
  const other2 = await makeSession(userA);
  const untouchedB = await makeSession(userB);

  await revokeOtherSessions(userA, current);

  assert.equal(await revokedAtOf(current), null, "the excluded session stays alive");
  assert.notEqual(await revokedAtOf(other1), null, "other sessions for the same user are revoked");
  assert.notEqual(await revokedAtOf(other2), null, "other sessions for the same user are revoked");
  assert.equal(await revokedAtOf(untouchedB), null, "another user's session is untouched");
});

test("revokeOtherSessions is a no-op against an already-revoked session", async () => {
  const userId = await makeUser("100000000003", "session-a-2@example.com");
  const current = await makeSession(userId);
  const alreadyRevoked = await makeSession(userId, new Date(Date.now() - 60_000));
  const revokedAtBefore = await revokedAtOf(alreadyRevoked);

  await revokeOtherSessions(userId, current);

  assert.equal(await revokedAtOf(current), null);
  assert.deepEqual(await revokedAtOf(alreadyRevoked), revokedAtBefore, "untouched, not re-stamped with a new time");
});

test("revokeAllSessions revokes every session for the user, including what would've been 'current'", async () => {
  const userId = await makeUser("100000000004", "session-a-3@example.com");
  const current = await makeSession(userId);
  const other = await makeSession(userId);

  await revokeAllSessions(userId);

  assert.notEqual(await revokedAtOf(current), null);
  assert.notEqual(await revokedAtOf(other), null);
});
