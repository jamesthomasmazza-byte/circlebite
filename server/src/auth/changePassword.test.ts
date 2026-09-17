import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";

import { pool } from "../db/pool.js";
import { changePassword } from "./changePassword.js";
import { hashPassword, verifyPassword } from "./password.js";
import { isRateLimited, recordAttempt } from "./rateLimit.js";

// Real Postgres, same discipline as deleteAccount.test.ts: each test seeds and cleans up its own
// fixture rather than sharing one.

const usersToClean = new Set<string>();

async function makeUser(idSuffix: string, email: string, password: string): Promise<string> {
  const id = `99990000-0000-0000-0000-${idSuffix}`;
  const passwordHash = await hashPassword(password);
  await pool.query(
    `INSERT INTO users (id, email, password_hash, display_name, age_attested_adult, age_attested_at)
     VALUES ($1, $2, $3, $2, true, now())`,
    [id, email, passwordHash],
  );
  usersToClean.add(id);
  return id;
}

async function makeSession(userId: string): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO sessions (user_id, token_hash, expires_at) VALUES ($1, $2, now() + interval '30 days') RETURNING id`,
    [userId, randomUUID()],
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

async function passwordHashOf(userId: string): Promise<string> {
  const { rows } = await pool.query<{ password_hash: string }>(
    "SELECT password_hash FROM users WHERE id = $1",
    [userId],
  );
  return rows[0].password_hash;
}

after(async () => {
  await pool.query("DELETE FROM users WHERE id = ANY($1)", [[...usersToClean]]);
  await pool.end();
});

test("wrong current password: returns invalid_current_password, hash and sessions untouched", async () => {
  const userId = await makeUser("100000000001", "changepw-1@example.com", "correct-horse-1");
  const session = await makeSession(userId);
  const hashBefore = await passwordHashOf(userId);

  const result = await changePassword(userId, session, "totally-wrong", "new-password-1");

  assert.deepEqual(result, { ok: false, reason: "invalid_current_password" });
  assert.equal(await passwordHashOf(userId), hashBefore);
  assert.equal(await revokedAtOf(session), null);
});

test("correct current password: new hash verifies, old one no longer does", async () => {
  const userId = await makeUser("100000000002", "changepw-2@example.com", "correct-horse-2");
  const session = await makeSession(userId);

  const result = await changePassword(userId, session, "correct-horse-2", "new-password-2");

  assert.deepEqual(result, { ok: true });
  const newHash = await passwordHashOf(userId);
  assert.equal(await verifyPassword("new-password-2", newHash), true);
  assert.equal(await verifyPassword("correct-horse-2", newHash), false);
});

test("revokes every other session but keeps the current one alive", async () => {
  const userId = await makeUser("100000000003", "changepw-3@example.com", "correct-horse-3");
  const current = await makeSession(userId);
  const other1 = await makeSession(userId);
  const other2 = await makeSession(userId);

  await changePassword(userId, current, "correct-horse-3", "new-password-3");

  assert.equal(await revokedAtOf(current), null, "the calling session survives");
  assert.notEqual(await revokedAtOf(other1), null);
  assert.notEqual(await revokedAtOf(other2), null);
});

test("a user with only the current session still succeeds, with nothing else to revoke", async () => {
  const userId = await makeUser("100000000004", "changepw-4@example.com", "correct-horse-4");
  const session = await makeSession(userId);

  const result = await changePassword(userId, session, "correct-horse-4", "new-password-4");

  assert.deepEqual(result, { ok: true });
  assert.equal(await revokedAtOf(session), null);
});

test("a successful change clears a prior login lockout for that email; a failed attempt leaves it untouched", async () => {
  const email = "changepw-5@example.com";
  const userId = await makeUser("100000000005", email, "correct-horse-5");
  const session = await makeSession(userId);
  const ip = "10.0.5.1";

  for (let i = 0; i < 5; i++) {
    await recordAttempt("login", ip, email);
  }
  assert.equal(await isRateLimited("login", ip, email), true);

  const failed = await changePassword(userId, session, "wrong-password", "new-password-5");
  assert.deepEqual(failed, { ok: false, reason: "invalid_current_password" });
  assert.equal(await isRateLimited("login", ip, email), true, "a failed change does not clear the login lockout");

  const succeeded = await changePassword(userId, session, "correct-horse-5", "new-password-5");
  assert.deepEqual(succeeded, { ok: true });
  assert.equal(await isRateLimited("login", ip, email), false, "a successful change clears it");
});
