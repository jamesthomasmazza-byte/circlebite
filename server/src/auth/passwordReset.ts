import { pool } from "../db/pool.js";
import { generateInviteToken, hashInviteToken } from "../lib/inviteToken.js";
import { hashPassword } from "./password.js";
import { clearLoginAttempts } from "./rateLimit.js";

// docs/server-setup.md §15: how long an admin-issued token stays usable before it must be
// re-issued.
const RESET_TOKEN_TTL_MINUTES = 60;

export type IssuedResetToken = { token: string; expiresAt: Date };

// Only ever called by hand, via the node -e snippet in docs/server-setup.md §15 — this app sends
// no email, so there is no route that triggers this.
export async function issuePasswordResetToken(userId: string): Promise<IssuedResetToken> {
  const token = generateInviteToken();
  const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MINUTES * 60 * 1000);

  await pool.query(
    `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)`,
    [userId, hashInviteToken(token), expiresAt],
  );

  return { token, expiresAt };
}

export type ConsumeResult = { ok: true } | { ok: false };

export async function consumePasswordResetToken(token: string, newPassword: string): Promise<ConsumeResult> {
  const tokenHash = hashInviteToken(token);

  const { rows } = await pool.query<{ id: string; user_id: string; email: string }>(
    `SELECT prt.id, prt.user_id, u.email
     FROM password_reset_tokens prt
     JOIN users u ON u.id = prt.user_id
     WHERE prt.token_hash = $1 AND prt.used_at IS NULL AND prt.expires_at > now()`,
    [tokenHash],
  );
  const record = rows[0];
  if (!record) return { ok: false };

  // Outside the transaction — no need to hold a row lock across a scrypt call.
  const passwordHash = await hashPassword(newPassword);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Same guarded-UPDATE pattern as circle.ts's invite-accept handlers: the repeated
    // "used_at IS NULL AND expires_at > now()" predicate here, not just on the SELECT above, is
    // what makes double-consumption race-proof.
    const { rowCount } = await client.query(
      `UPDATE password_reset_tokens SET used_at = now()
       WHERE id = $1 AND used_at IS NULL AND expires_at > now()`,
      [record.id],
    );
    if (rowCount === 0) {
      await client.query("ROLLBACK");
      return { ok: false };
    }

    await client.query("UPDATE users SET password_hash = $1, updated_at = now() WHERE id = $2", [
      passwordHash,
      record.user_id,
    ]);
    // Revokes ALL sessions, not "all but current" — there's no current session in this flow, the
    // whole point is recovering an account with no live session at all.
    await client.query("UPDATE sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL", [
      record.user_id,
    ]);

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }

  // Outside the transaction, via the pool: not transactionally coupled to the password/session
  // update above — a failure here would only mean a wasted attempt-clear, not a security issue,
  // so it doesn't need to roll back an otherwise-successful reset.
  await clearLoginAttempts(record.email);

  return { ok: true };
}
