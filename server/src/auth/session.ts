import { createHmac, randomBytes } from "node:crypto";

import type { CookieOptions } from "express";
import type { PoolClient } from "pg";

import { pool } from "../db/pool.js";
import { env } from "../env.js";
import { isJudgeLinkAccount, judgeLinkOpen } from "./judgeLinkRules.js";

export const SESSION_COOKIE_NAME = "cb_session";
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // fixed 30-day window, not sliding

/** maxAgeMs: shorter for a session that ends sooner, the judge link's (auth/judgeLink.ts). */
export function sessionCookieOptions(maxAgeMs: number = SESSION_TTL_MS): CookieOptions {
  return {
    httpOnly: true,
    secure: env.isProduction,
    sameSite: "lax",
    path: "/",
    maxAge: maxAgeMs,
  };
}

function hashToken(token: string): string {
  return createHmac("sha256", env.sessionSecret).update(token).digest("hex");
}

/**
 * options (2026-11-07, the judge link): a client to write inside the caller's transaction, and an
 * expiry earlier than the usual 30 days. Every other caller passes neither.
 */
export async function createSession(
  userId: string,
  options: { client?: PoolClient; expiresAt?: Date } = {},
): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString("hex");
  const expiresAt = options.expiresAt ?? new Date(Date.now() + SESSION_TTL_MS);

  await (options.client ?? pool).query(
    `INSERT INTO sessions (user_id, token_hash, expires_at) VALUES ($1, $2, $3)`,
    [userId, hashToken(token), expiresAt],
  );

  return { token, expiresAt };
}

export type ValidatedSession = {
  sessionId: string;
  actingProfileId: string | null;
  user: { id: string; email: string; displayName: string; isAdmin: boolean };
};

export async function validateSession(token: string): Promise<ValidatedSession | null> {
  const { rows } = await pool.query<{
    session_id: string;
    user_id: string;
    acting_profile_id: string | null;
    email: string;
    display_name: string;
    is_admin: boolean;
  }>(
    `SELECT s.id AS session_id, s.user_id, s.acting_profile_id, u.email, u.display_name, u.is_admin
     FROM sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = $1 AND s.revoked_at IS NULL AND s.expires_at > now()`,
    [hashToken(token)],
  );

  const row = rows[0];
  if (!row) return null;
  // A judge link session stops with the link: switched off, or past JUDGE_LINK_EXPIRES, even before
  // its own expiry (auth/judgeLinkRules.ts). Turning JUDGE_LINK off signs every link judge out.
  if (isJudgeLinkAccount(row.email) && !judgeLinkOpen(new Date())) return null;

  return {
    sessionId: row.session_id,
    actingProfileId: row.acting_profile_id,
    user: { id: row.user_id, email: row.email, displayName: row.display_name, isAdmin: row.is_admin },
  };
}

export async function revokeSession(token: string): Promise<void> {
  await pool.query(`UPDATE sessions SET revoked_at = now() WHERE token_hash = $1`, [
    hashToken(token),
  ]);
}

// Used by change-password: keeps the session that made the request alive, revokes every other
// one for that user — the whole point of changing a password is to sign out any other device.
export async function revokeOtherSessions(userId: string, exceptSessionId: string): Promise<void> {
  await pool.query(
    `UPDATE sessions SET revoked_at = now() WHERE user_id = $1 AND id != $2 AND revoked_at IS NULL`,
    [userId, exceptSessionId],
  );
}

// Used by password-reset token consumption: there's no "current" session to preserve, since the
// whole flow exists for someone who's locked out with no live session at all.
export async function revokeAllSessions(userId: string): Promise<void> {
  await pool.query(`UPDATE sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL`, [
    userId,
  ]);
}
