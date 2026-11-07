import { Router, type Response } from "express";
import type { PoolClient } from "pg";

import { JUDGE_LINK_POOL_EMAILS } from "../db/seed/seedData.js";
import { pool } from "../db/pool.js";
import { env } from "../env.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { isSeedEmail } from "../lib/seedMarker.js";
import { judgeLinkOpen, tokenMatches } from "./judgeLinkRules.js";
import { createSession, SESSION_COOKIE_NAME, SESSION_TTL_MS, sessionCookieOptions } from "./session.js";

// The judge link (Prof. Yoest, Nov 5, 2026, 4:38 PM; JT approved the pre-seeded pool, Nov 7): one URL,
// /judge#<token>, for every judge. The page POSTs the token from the fragment, which never reaches a
// server log, and each click is signed in to a world from the judge seed's pool that nobody has used
// (db/seed/seedData.ts, JUDGE_LINK_POOL). The link never creates an account and never signs in to an
// existing one that has been used: only a pool judge with no session ever, never admin.
//
// Every refusal is the same plain 404: switch off, past the expiry, wrong or missing token, too many
// recent clicks, an empty pool. Nothing tells a caller which.

export const judgeLinkRouter = Router();

/** A global limit on worlds handed out: at most this many in any window, whoever is clicking. */
export const JUDGE_LINK_RATE = { max: 10, minutes: 10 };

// Serializes claims, so the rate count and "nobody has used it" are read and acted on by one claim
// at a time. Transaction-scoped: released at COMMIT or ROLLBACK.
const CLAIM_LOCK = 0x1d6e;

export type ClaimedWorld = {
  user: { id: string; email: string; displayName: string };
  world: number;
  profileId: string;
};

/**
 * Picks the lowest pool world nobody has signed in to, inside the caller's transaction, or null.
 * "Used" is any session at all, revoked or expired included: sessions are never deleted, only
 * revoked, so a world stays used after its judge logs out.
 */
export async function claimJudgeLinkWorld(client: PoolClient): Promise<ClaimedWorld | null> {
  await client.query("SELECT pg_advisory_xact_lock($1)", [CLAIM_LOCK]);

  const { rows: recent } = await client.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE u.email = ANY($1) AND s.created_at > now() - make_interval(mins => $2)`,
    [JUDGE_LINK_POOL_EMAILS, JUDGE_LINK_RATE.minutes],
  );
  if (recent[0].n >= JUDGE_LINK_RATE.max) return null;

  const { rows } = await client.query<{ id: string; email: string; display_name: string; judge_world: number }>(
    `SELECT u.id, u.email, u.display_name, u.judge_world FROM users u
     WHERE u.email = ANY($1) AND u.judge_world IS NOT NULL AND u.is_admin = false
       AND NOT EXISTS (SELECT 1 FROM sessions s WHERE s.user_id = u.id)
     ORDER BY u.judge_world
     LIMIT 1`,
    [JUDGE_LINK_POOL_EMAILS],
  );
  const user = rows[0];
  // Belt and braces over the query: a pool address is always on the reserved domain.
  if (!user || !isSeedEmail(user.email)) return null;

  // Maya, whom the pool judge owns: where the link lands, on 2990000000083's card.
  const { rows: maya } = await client.query<{ id: string }>(
    "SELECT id FROM allergen_profiles WHERE manager_id = $1 AND label = 'Maya'",
    [user.id],
  );
  if (!maya[0]) return null;

  return { user: { id: user.id, email: user.email, displayName: user.display_name }, world: user.judge_world, profileId: maya[0].id };
}

function notFound(res: Response): void {
  res.status(404).json({ error: "not_found" });
}

judgeLinkRouter.post(
  "/judge-link",
  asyncHandler(async (req, res) => {
    const now = new Date();
    if (!judgeLinkOpen(now) || !tokenMatches(req.body?.token, env.judgeLinkTokenHash)) {
      notFound(res);
      return;
    }

    const client = await pool.connect();
    let claimed: ClaimedWorld | null;
    let session: { token: string; expiresAt: Date } | null = null;
    try {
      await client.query("BEGIN");
      claimed = await claimJudgeLinkWorld(client);
      if (claimed) {
        // Never outlives the link: the session ends at the expiry if that comes first.
        const expiresAt = new Date(Math.min(now.getTime() + SESSION_TTL_MS, env.judgeLinkExpires.getTime()));
        session = await createSession(claimed.user.id, { client, expiresAt });
      }
      await client.query(claimed ? "COMMIT" : "ROLLBACK");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
    if (!claimed || !session) {
      notFound(res);
      return;
    }

    res.cookie(SESSION_COOKIE_NAME, session.token, sessionCookieOptions(session.expiresAt.getTime() - now.getTime()));
    res.status(200).json({
      id: claimed.user.id,
      email: claimed.user.email,
      displayName: claimed.user.displayName,
      isAdmin: false,
      expiresAt: session.expiresAt,
      profileId: claimed.profileId,
    });
  }),
);
