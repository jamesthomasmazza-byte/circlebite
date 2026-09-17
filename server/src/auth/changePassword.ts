import { pool } from "../db/pool.js";
import { hashPassword, verifyPassword } from "./password.js";
import { clearLoginAttempts } from "./rateLimit.js";
import { revokeOtherSessions } from "./session.js";

export type ChangePasswordResult = { ok: true } | { ok: false; reason: "invalid_current_password" };

export async function changePassword(
  userId: string,
  currentSessionId: string,
  currentPassword: string,
  newPassword: string,
): Promise<ChangePasswordResult> {
  const { rows } = await pool.query<{ email: string; password_hash: string }>(
    "SELECT email, password_hash FROM users WHERE id = $1",
    [userId],
  );
  const user = rows[0];
  if (!user || !(await verifyPassword(currentPassword, user.password_hash))) {
    return { ok: false, reason: "invalid_current_password" };
  }

  const passwordHash = await hashPassword(newPassword);
  await pool.query("UPDATE users SET password_hash = $1, updated_at = now() WHERE id = $2", [
    passwordHash,
    userId,
  ]);
  await revokeOtherSessions(userId, currentSessionId);
  await clearLoginAttempts(user.email);

  return { ok: true };
}
