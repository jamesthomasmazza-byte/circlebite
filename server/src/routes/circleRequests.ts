import { Router } from "express";

import { getProfileAccess } from "../authorization/profiles.js";
import { normalizeEmail } from "../auth/email.js";
import { isRateLimited, recordAttempt } from "../auth/rateLimit.js";
import { requireAuth } from "../auth/requireAuth.js";
import { pool } from "../db/pool.js";
import { env } from "../env.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { HttpError } from "../lib/httpError.js";
import { generateInviteToken, hashInviteToken } from "../lib/inviteToken.js";

/**
 * Follow requests (BACKLOG "Plan to judging" item 6, 2026-10-27; migration 0047), behind
 * CIRCLE_REQUESTS. Someone asks to follow by typing the email address of a parent they already
 * know. Nothing is searchable or listed: without the exact address there is nothing to find.
 *
 * The requester learns nothing until the owner approves — not the owner's name, not a profile, not
 * whether the address has an account. POST /circle-requests answers the same in every case, and
 * there is no list of requests sent. Only the owner sees a request, and only the owner decides it,
 * picking one of their own profiles and the share level. Follow only: co-managers still come by
 * invite link alone (CONTEST_RULES.md §3a). Invite links are unchanged (routes/circle.ts).
 */
export const circleRequestsRouter = Router();

/** How long a declined request is kept, so asking again is silently dropped. Then it's purged. */
export const DECLINED_KEPT_DAYS = 30;

/** Past this many waiting requests, new ones are dropped, so nobody can flood an owner's notice. */
export const MAX_WAITING_PER_OWNER = 20;

const MAX_EMAIL_LENGTH = 254;

const SHARE_LEVELS = ["all", "severe_only"] as const;
function isShareLevel(value: unknown): value is (typeof SHARE_LEVELS)[number] {
  return typeof value === "string" && (SHARE_LEVELS as readonly string[]).includes(value);
}

function requireCircleRequestsEnabled(_req: unknown, _res: unknown, next: (err?: unknown) => void) {
  if (!env.circleRequests) {
    next(new HttpError(404, "not_found"));
    return;
  }
  next();
}

/** The one answer to every well-formed request, whatever happened to it. */
export const REQUEST_RECEIVED = { received: true } as const;

/**
 * Files the request if there's someone to file it with, else does nothing — the caller can't tell
 * which. Dropped: no account at that address; the requester's own; an account that owns no profile;
 * a request already waiting; one declined in the last DECLINED_KEPT_DAYS; an owner with
 * MAX_WAITING_PER_OWNER waiting; and a requester who already follows or manages every profile the
 * owner has. Returns whether a row was written, for tests only.
 */
export async function fileCircleRequest(requesterId: string, typedEmail: string): Promise<boolean> {
  const { rowCount } = await pool.query(
    `WITH owner AS (
       SELECT u.id FROM users u
       WHERE u.email = $2 AND u.id <> $1
         AND EXISTS (
           SELECT 1 FROM allergen_profiles p
           WHERE p.manager_id = u.id
             AND NOT EXISTS (SELECT 1 FROM profile_managers m WHERE m.allergen_profile_id = p.id AND m.user_id = $1)
             AND NOT EXISTS (SELECT 1 FROM follow_relationships f
                             WHERE f.allergen_profile_id = p.id AND f.follower_id = $1 AND f.status = 'accepted')
         )
         AND NOT EXISTS (
           SELECT 1 FROM circle_requests r
           WHERE r.requester_id = $1 AND r.owner_id = u.id AND r.status = 'declined'
             AND r.responded_at > now() - make_interval(days => $3)
         )
         AND (SELECT count(*) FROM circle_requests r WHERE r.owner_id = u.id AND r.status = 'pending') < $4
     )
     INSERT INTO circle_requests (requester_id, owner_id)
     SELECT $1, id FROM owner
     ON CONFLICT (requester_id, owner_id) WHERE status = 'pending' DO NOTHING`,
    [requesterId, normalizeEmail(typedEmail), DECLINED_KEPT_DAYS, MAX_WAITING_PER_OWNER],
  );
  return (rowCount ?? 0) > 0;
}

circleRequestsRouter.post(
  "/circle-requests",
  requireAuth,
  requireCircleRequestsEnabled,
  asyncHandler(async (req, res) => {
    const { email } = req.body ?? {};
    if (typeof email !== "string" || email.trim() === "" || email.length > MAX_EMAIL_LENGTH || !email.includes("@")) {
      throw new HttpError(400, "invalid_request");
    }

    // Keyed by the requester's own address: the one they typed is never stored, not even hashed.
    const ip = req.ip ?? "unknown";
    if (await isRateLimited("circle_request", ip, req.user!.email)) {
      res.status(429).json({ error: "too_many_attempts" });
      return;
    }
    await recordAttempt("circle_request", ip, req.user!.email);

    await fileCircleRequest(req.user!.id, email);
    res.status(202).json(REQUEST_RECEIVED);
  }),
);

// The owner's waiting requests, each with the owner's own profiles the requester doesn't already
// see. The requester's display name and email: the form told them the owner would see both. Empty
// for anyone else — a requester has no list of what they sent.
circleRequestsRouter.get(
  "/circle-requests",
  requireAuth,
  requireCircleRequestsEnabled,
  asyncHandler(async (req, res) => {
    const ownerId = req.user!.id;
    const { rows } = await pool.query(
      `SELECT r.id, r.created_at, u.display_name AS requester_name, u.email AS requester_email,
              COALESCE(
                (SELECT json_agg(json_build_object('id', p.id, 'label', p.label) ORDER BY p.created_at)
                 FROM allergen_profiles p
                 WHERE p.manager_id = r.owner_id
                   AND NOT EXISTS (SELECT 1 FROM profile_managers m WHERE m.allergen_profile_id = p.id AND m.user_id = r.requester_id)
                   AND NOT EXISTS (SELECT 1 FROM follow_relationships f
                                   WHERE f.allergen_profile_id = p.id AND f.follower_id = r.requester_id AND f.status = 'accepted')),
                '[]'::json
              ) AS profiles
       FROM circle_requests r
       JOIN users u ON u.id = r.requester_id
       WHERE r.owner_id = $1 AND r.status = 'pending'
       ORDER BY r.created_at`,
      [ownerId],
    );
    res.json(rows);
  }),
);

/** The waiting request, if it's this user's to decide. Anyone else's, or a decided one, is a 404. */
async function loadOwnersRequest(requestId: string, ownerId: string): Promise<{ id: string; requester_id: string }> {
  const { rows } = await pool.query<{ id: string; requester_id: string }>(
    `SELECT id, requester_id FROM circle_requests WHERE id = $1 AND owner_id = $2 AND status = 'pending'`,
    [requestId, ownerId],
  );
  if (!rows[0]) throw new HttpError(404, "not_found");
  return rows[0];
}

circleRequestsRouter.post(
  "/circle-requests/:id/approve",
  requireAuth,
  requireCircleRequestsEnabled,
  asyncHandler(async (req, res) => {
    const ownerId = req.user!.id;
    const { profileId, shareLevel } = req.body ?? {};
    if (typeof profileId !== "string" || !isShareLevel(shareLevel)) throw new HttpError(400, "invalid_request");

    const request = await loadOwnersRequest(req.params.id, ownerId);

    // One of the approver's own profiles — not one they co-manage. 404 otherwise, as for a profile
    // they can't see at all.
    const { rows: owned } = await pool.query("SELECT 1 FROM allergen_profiles WHERE id = $1 AND manager_id = $2", [
      profileId,
      ownerId,
    ]);
    if (owned.length === 0) throw new HttpError(404, "not_found");

    // docs/coppa.md §2.4: confirm the follower attested to being an adult before creating it.
    const { rows: requester } = await pool.query<{ age_attested_adult: boolean }>(
      "SELECT age_attested_adult FROM users WHERE id = $1",
      [request.requester_id],
    );
    if (!requester[0]?.age_attested_adult) throw new HttpError(409, "requester_not_eligible");

    if (await getProfileAccess(request.requester_id, profileId)) throw new HttpError(409, "already_have_access");

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      // An accepted follow, as an accepted invite would leave it. The token hash is required by the
      // table and never shown anywhere: there is no link. A follow revoked earlier is reused, since a
      // person follows a profile at most once (follow_relationships' unique pair).
      await client.query(
        `INSERT INTO follow_relationships (allergen_profile_id, follower_id, invited_by, token_hash, status, share_level, responded_at)
         VALUES ($1, $2, $3, $4, 'accepted', $5, now())
         ON CONFLICT (follower_id, allergen_profile_id) DO UPDATE
           SET status = 'accepted', share_level = EXCLUDED.share_level, invited_by = EXCLUDED.invited_by,
               responded_at = now()
           WHERE follow_relationships.status = 'revoked'`,
        [profileId, request.requester_id, ownerId, hashInviteToken(generateInviteToken()), shareLevel],
      );
      const { rowCount } = await client.query("DELETE FROM circle_requests WHERE id = $1 AND status = 'pending'", [request.id]);
      if (rowCount === 0) throw new HttpError(404, "not_found");
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }

    res.status(204).end();
  }),
);

circleRequestsRouter.post(
  "/circle-requests/:id/decline",
  requireAuth,
  requireCircleRequestsEnabled,
  asyncHandler(async (req, res) => {
    const request = await loadOwnersRequest(req.params.id, req.user!.id);
    await pool.query(
      "UPDATE circle_requests SET status = 'declined', responded_at = now() WHERE id = $1 AND status = 'pending'",
      [request.id],
    );
    res.status(204).end();
  }),
);
