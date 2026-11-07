import { pool } from "../db/pool.js";
import { HttpError } from "../lib/httpError.js";
import { isSeedEmail } from "../lib/seedMarker.js";

/**
 * Gates internal aggregate pages (the AI accuracy report today, the review queue later) behind
 * `users.is_admin`. 404, not 403, for the same reason `assertCanReadProfile` uses 404 — a route
 * that exists but isn't visible to this user should look identical to one that doesn't exist, not
 * announce "there's something here, you're just not allowed."
 */
export async function assertIsAdmin(userId: string): Promise<void> {
  const { rows } = await pool.query<{ is_admin: boolean; email: string }>("SELECT is_admin, email FROM users WHERE id = $1", [
    userId,
  ]);
  if (!rows[0] || !isAdminAccount(rows[0])) throw new HttpError(404, "not_found");
}

/**
 * is_admin, and never an account on the judge seed's reserved domain (2026-11-07). The seed writes
 * is_admin = false for all of them; this holds even if one were flipped by hand, so no judge account
 * — one the judge link signs in to above all (auth/judgeLink.ts) — can open an admin page or API.
 */
export function isAdminAccount(user: { is_admin: boolean; email: string }): boolean {
  return user.is_admin && !isSeedEmail(user.email);
}
