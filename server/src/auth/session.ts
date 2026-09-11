import { createHmac, randomBytes } from "node:crypto";

import type { CookieOptions } from "express";

import { pool } from "../db/pool.js";
import { env } from "../env.js";

export const SESSION_COOKIE_NAME = "cb_session";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // fixed 30-day window, not sliding

export function sessionCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: env.isProduction,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_MS,
  };
}

function hashToken(token: string): string {
  return createHmac("sha256", env.sessionSecret).update(token).digest("hex");
}

export async function createSession(userId: string): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  await pool.query(
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
