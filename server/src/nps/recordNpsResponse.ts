import { pool } from "../db/pool.js";
import { HttpError } from "../lib/httpError.js";

// Rolling window, not a stored expiry — recomputed against created_at on every check. Keep in sync
// with the "90 days" literal in the SQL below if this ever changes.
export const RESUBMISSION_WINDOW_DAYS = 90;

export type NpsResponse = {
  id: string;
  score: number;
  reason: string | null;
  createdAt: string;
};

type NpsResponseRow = {
  id: string;
  score: number;
  reason: string | null;
  created_at: Date;
};

function toNpsResponse(row: NpsResponseRow): NpsResponse {
  return {
    id: row.id,
    score: row.score,
    reason: row.reason,
    createdAt: row.created_at.toISOString(),
  };
}

/**
 * The user's own most recent response within the resubmission window, or null if they've never
 * responded or their last response has aged out. Seed rows are irrelevant here — this only ever
 * queries by a real user_id, and seed rows are inserted with user_id NULL.
 */
export async function getCurrentNpsResponse(userId: string): Promise<NpsResponse | null> {
  const { rows } = await pool.query<NpsResponseRow>(
    `SELECT id, score, reason, created_at FROM nps_responses
     WHERE user_id = $1 AND created_at > now() - interval '90 days'
     ORDER BY created_at DESC
     LIMIT 1`,
    [userId],
  );
  return rows[0] ? toNpsResponse(rows[0]) : null;
}

/**
 * Records one self-initiated NPS response. Score/reason shape validation happens here so a bad
 * request gets a clean 400 instead of a raw CHECK-constraint violation surfacing as a 500 — the
 * constraint itself (migration 0024) is the backstop, not the primary guard.
 */
export async function recordNpsResponse(
  userId: string,
  score: number,
  reason: string | null,
): Promise<NpsResponse> {
  if (!Number.isInteger(score) || score < 0 || score > 10) {
    throw new HttpError(400, "invalid_request");
  }
  if (reason !== null && typeof reason !== "string") {
    throw new HttpError(400, "invalid_request");
  }

  const existing = await getCurrentNpsResponse(userId);
  if (existing) throw new HttpError(409, "already_responded");

  const { rows } = await pool.query<NpsResponseRow>(
    `INSERT INTO nps_responses (user_id, score, reason, source)
     VALUES ($1, $2, $3, 'user')
     RETURNING id, score, reason, created_at`,
    [userId, score, reason],
  );
  return toNpsResponse(rows[0]);
}
