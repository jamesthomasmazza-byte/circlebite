import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";

import { pool } from "../db/pool.js";
import { hashInviteToken } from "../lib/inviteToken.js";
import { hashPassword, verifyPassword } from "./password.js";
import { consumePasswordResetToken, issuePasswordResetToken } from "./passwordReset.js";
import { isRateLimited, recordAttempt } from "./rateLimit.js";

// Real Postgres, same discipline as deleteAccount.test.ts: each test seeds and cleans up its own
// fixture rather than sharing one.

const usersToClean = new Set<string>();
const tokensToClean = new Set<string>();

async function makeUser(idSuffix: string, email: string, password: string): Promise<string> {
  const id = `aaaa0000-0000-0000-0000-${idSuffix}`;
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

async function seedToken(
  userId: string,
  opts: { usedAt?: Date; expiresAt?: Date } = {},
): Promise<string> {
  const token = randomUUID();
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at, used_at)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [
      userId,
      hashInviteToken(token),
      opts.expiresAt ?? new Date(Date.now() + 60 * 60 * 1000),
      opts.usedAt ?? null,
    ],
  );
  tokensToClean.add(rows[0].id);
  return token;
}

after(async () => {
  await pool.query("DELETE FROM password_reset_tokens WHERE id = ANY($1)", [[...tokensToClean]]);
  await pool.query("DELETE FROM users WHERE id = ANY($1)", [[...usersToClean]]);
  await pool.end();
});

test("expired token: consumption fails, nothing changed", async () => {
  const userId = await makeUser("100000000001", "reset-1@example.com", "old-password-1");
  const hashBefore = await passwordHashOf(userId);
  const token = await seedToken(userId, { expiresAt: new Date(Date.now() - 60_000) });

  const result = await consumePasswordResetToken(token, "new-password-1");

  assert.deepEqual(result, { ok: false });
  assert.equal(await passwordHashOf(userId), hashBefore);
});

test("already-used token: consumption fails", async () => {
  const userId = await makeUser("100000000002", "reset-2@example.com", "old-password-2");
  const hashBefore = await passwordHashOf(userId);
  const token = await seedToken(userId, { usedAt: new Date() });

  const result = await consumePasswordResetToken(token, "new-password-2");

  assert.deepEqual(result, { ok: false });
  assert.equal(await passwordHashOf(userId), hashBefore);
});

test("token for a since-deleted account: consumption fails, same shape as a never-issued token", async () => {
  const userId = await makeUser("100000000003", "reset-3@example.com", "old-password-3");
  const token = await seedToken(userId);

  // ON DELETE CASCADE takes the token row with it — nothing left for `after` to clean up either.
  await pool.query("DELETE FROM users WHERE id = $1", [userId]);
  usersToClean.delete(userId);

  const deletedAccountResult = await consumePasswordResetToken(token, "new-password-3");
  const neverIssuedResult = await consumePasswordResetToken("never-issued-token", "new-password-3");

  assert.deepEqual(deletedAccountResult, { ok: false });
  assert.deepEqual(deletedAccountResult, neverIssuedResult, "identical generic-error shape");
});

test("valid token: succeeds, password updates, ALL sessions for that user are revoked", async () => {
  const userId = await makeUser("100000000004", "reset-4@example.com", "old-password-4");
  const session1 = await makeSession(userId);
  const session2 = await makeSession(userId);
  const token = await seedToken(userId);

  const result = await consumePasswordResetToken(token, "new-password-4");

  assert.deepEqual(result, { ok: true });
  const newHash = await passwordHashOf(userId);
  assert.equal(await verifyPassword("new-password-4", newHash), true);
  assert.equal(await verifyPassword("old-password-4", newHash), false);
  assert.notEqual(await revokedAtOf(session1), null, "no session is spared — there's no current one to preserve");
  assert.notEqual(await revokedAtOf(session2), null);
});

test("single-use enforcement: a second consumption of the same raw token fails", async () => {
  const userId = await makeUser("100000000005", "reset-5@example.com", "old-password-5");
  const token = await seedToken(userId);

  const first = await consumePasswordResetToken(token, "new-password-5a");
  assert.deepEqual(first, { ok: true });

  const second = await consumePasswordResetToken(token, "new-password-5b");
  assert.deepEqual(second, { ok: false });

  const hash = await passwordHashOf(userId);
  assert.equal(await verifyPassword("new-password-5a", hash), true, "the first change stuck, the second did not overwrite it");
});

test("a successful consumption clears a prior login lockout for that account's email", async () => {
  const email = "reset-6@example.com";
  const userId = await makeUser("100000000006", email, "old-password-6");
  const token = await seedToken(userId);
  const ip = "10.0.6.1";

  for (let i = 0; i < 5; i++) {
    await recordAttempt("login", ip, email);
  }
  assert.equal(await isRateLimited("login", ip, email), true);

  const result = await consumePasswordResetToken(token, "new-password-6");

  assert.deepEqual(result, { ok: true });
  assert.equal(await isRateLimited("login", ip, email), false);
});
