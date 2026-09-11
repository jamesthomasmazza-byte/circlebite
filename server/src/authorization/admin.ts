import { pool } from "../db/pool.js";
import { HttpError } from "../lib/httpError.js";

/**
 * Gates internal aggregate pages (the AI accuracy report today, the review queue later) behind
 * `users.is_admin`. 404, not 403, for the same reason `assertCanReadProfile` uses 404 — a route
 * that exists but isn't visible to this user should look identical to one that doesn't exist, not
 * announce "there's something here, you're just not allowed."
 */
export async function assertIsAdmin(userId: string): Promise<void> {
  const { rows } = await pool.query<{ is_admin: boolean }>("SELECT is_admin FROM users WHERE id = $1", [userId]);
  if (!rows[0]?.is_admin) throw new HttpError(404, "not_found");
}
