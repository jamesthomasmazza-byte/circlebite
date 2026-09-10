import { Router } from "express";

import { assertCanManageProfile, getProfileAccess } from "../authorization/profiles.js";
import { requireAuth } from "../auth/requireAuth.js";
import { pool } from "../db/pool.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { HttpError } from "../lib/httpError.js";
import { generateInviteToken, hashInviteToken } from "../lib/inviteToken.js";

export const circleRouter = Router();

const SHARE_LEVELS = ["all", "severe_only"] as const;
function isShareLevel(value: unknown): value is (typeof SHARE_LEVELS)[number] {
  return typeof value === "string" && (SHARE_LEVELS as readonly string[]).includes(value);
}

// ---- Follow invites ----

circleRouter.post(
  "/profiles/:id/follow-invites",
  requireAuth,
  asyncHandler(async (req, res) => {
    const profileId = req.params.id;
    await assertCanManageProfile(req.user!.id, profileId);

    const { shareLevel, message } = req.body ?? {};
    if (!isShareLevel(shareLevel)) throw new HttpError(400, "invalid_request");
    if (message !== undefined && typeof message !== "string") throw new HttpError(400, "invalid_request");

    const token = generateInviteToken();
    const { rows } = await pool.query<{ id: string }>(
      `INSERT INTO follow_relationships (allergen_profile_id, invited_by, token_hash, share_level, message)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [profileId, req.user!.id, hashInviteToken(token), shareLevel, message ?? null],
    );

    // Shown once, like a raw session token — never retrievable again after this response.
    res.status(201).json({ id: rows[0]!.id, token });
  }),
);

// Public: no requireAuth. Lets a not-yet-authenticated recipient see what they're being invited
// to before being asked to log in.
circleRouter.get(
  "/follow/:token",
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query<{ label: string; share_level: string; status: string }>(
      `SELECT p.label, f.share_level, f.status
       FROM follow_relationships f
       JOIN allergen_profiles p ON p.id = f.allergen_profile_id
       WHERE f.token_hash = $1`,
      [hashInviteToken(req.params.token)],
    );
    const row = rows[0];
    if (!row) throw new HttpError(404, "not_found");
    res.json({ profileLabel: row.label, shareLevel: row.share_level, status: row.status });
  }),
);

circleRouter.post(
  "/follow/:token/accept",
  requireAuth,
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    const tokenHash = hashInviteToken(req.params.token);

    const { rows } = await pool.query<{ id: string; allergen_profile_id: string; manager_id: string }>(
      `SELECT f.id, f.allergen_profile_id, p.manager_id
       FROM follow_relationships f
       JOIN allergen_profiles p ON p.id = f.allergen_profile_id
       WHERE f.token_hash = $1 AND f.status = 'pending'`,
      [tokenHash],
    );
    const invite = rows[0];
    if (!invite) throw new HttpError(404, "invalid_or_used_invite");

    if (invite.manager_id === userId) throw new HttpError(400, "cannot_accept_own_invite");

    const existingAccess = await getProfileAccess(userId, invite.allergen_profile_id);
    if (existingAccess) throw new HttpError(409, "already_have_access");

    const { rowCount } = await pool.query(
      `UPDATE follow_relationships
       SET follower_id = $2, status = 'accepted', responded_at = now()
       WHERE id = $1 AND status = 'pending'`,
      [invite.id, userId],
    );
    // status = 'pending' guard above makes this atomic against a concurrent double-accept; if
    // another request won the race between the SELECT and here, this UPDATE matches zero rows.
    if (rowCount === 0) throw new HttpError(404, "invalid_or_used_invite");

    res.status(200).json({ allergenProfileId: invite.allergen_profile_id });
  }),
);

circleRouter.post(
  "/profiles/:id/follows/:followId/revoke",
  requireAuth,
  asyncHandler(async (req, res) => {
    const profileId = req.params.id;
    await assertCanManageProfile(req.user!.id, profileId);

    const { rowCount } = await pool.query(
      `UPDATE follow_relationships SET status = 'revoked'
       WHERE id = $1 AND allergen_profile_id = $2 AND status = 'accepted'`,
      [req.params.followId, profileId],
    );
    if (rowCount === 0) throw new HttpError(404, "not_found");
    res.status(204).end();
  }),
);

circleRouter.get(
  "/profiles/:id/circle",
  requireAuth,
  asyncHandler(async (req, res) => {
    const profileId = req.params.id;
    await assertCanManageProfile(req.user!.id, profileId);

    const { rows: pendingFollows } = await pool.query(
      `SELECT id, share_level, message, created_at
       FROM follow_relationships
       WHERE allergen_profile_id = $1 AND status = 'pending'
       ORDER BY created_at`,
      [profileId],
    );
    const { rows: followers } = await pool.query(
      `SELECT f.id, f.share_level, f.responded_at, u.display_name, u.email
       FROM follow_relationships f
       JOIN users u ON u.id = f.follower_id
       WHERE f.allergen_profile_id = $1 AND f.status = 'accepted'
       ORDER BY f.responded_at`,
      [profileId],
    );
    const { rows: managers } = await pool.query(
      `SELECT pm.user_id, pm.added_at, u.display_name, u.email
       FROM profile_managers pm
       JOIN users u ON u.id = pm.user_id
       WHERE pm.allergen_profile_id = $1
       ORDER BY pm.added_at`,
      [profileId],
    );

    res.json({ pendingFollows, followers, managers });
  }),
);
