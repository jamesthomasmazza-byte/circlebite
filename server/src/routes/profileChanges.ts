import { Router } from "express";

import { assertCanManageProfile, assertIsProfileOwner } from "../authorization/profiles.js";
import { requireAuth } from "../auth/requireAuth.js";
import { EXTENSION_TO_MIME, resolvePhotoPath } from "../corrections/photoStorage.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { HttpError } from "../lib/httpError.js";
import { acknowledgeChanges, loadUnseenChanges } from "../profileChanges/acks.js";
import { loadChangePhotoPath, loadProfileHistory } from "../profileChanges/history.js";

// The profile change history (migrations 0036–0040) and the owner's unseen-changes banner — Prof.
// Yoest's Oct 1 conditions. New reads plus the owner's acknowledgement; no existing permission
// changes. Per-route requireAuth, mounted at bare /api, same reasoning as correctionsRouter.
export const profileChangesRouter = Router();

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Owner and co-managers: the people who can change the profile can read what was changed.
// Followers can't — a severe_only follower must not learn a mild allergen's name from its history,
// and a follower was never the audience for "who edited this". assertCanManageProfile 404s them,
// the same answer as a profile they can't see at all.
profileChangesRouter.get(
  "/profiles/:id/changes",
  requireAuth,
  asyncHandler(async (req, res) => {
    const profileId = req.params.id;
    await assertCanManageProfile(req.user!.id, profileId);
    res.json(await loadProfileHistory(profileId, req.user!.id));
  }),
);

// The evidence photo for a downgrade entry, from the entry's own snapshot — so it is still
// reachable after the scan it was filed on is gone, which the scan-keyed corrections photo route
// can't do (migration 0020).
profileChangesRouter.get(
  "/profiles/:id/changes/:changeId/photo",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { id: profileId, changeId } = req.params;
    await assertCanManageProfile(req.user!.id, profileId);
    if (!UUID_PATTERN.test(changeId)) throw new HttpError(404, "not_found");

    const photoPath = await loadChangePhotoPath(profileId, changeId);
    if (!photoPath) throw new HttpError(404, "not_found");

    const extension = photoPath.split(".").pop() ?? "";
    res.setHeader("Content-Type", EXTENSION_TO_MIME[extension] ?? "application/octet-stream");
    res.sendFile(resolvePhotoPath(photoPath));
  }),
);

// Owner only: the banner is the owner's, so acknowledging it is too.
profileChangesRouter.post(
  "/profiles/:id/changes/seen",
  requireAuth,
  asyncHandler(async (req, res) => {
    const profileId = req.params.id;
    await assertIsProfileOwner(req.user!.id, profileId);

    const { changeIds } = req.body ?? {};
    if (!Array.isArray(changeIds) || !changeIds.every((id) => typeof id === "string") || changeIds.length > 500) {
      throw new HttpError(400, "invalid_request");
    }
    const acknowledged = await acknowledgeChanges(req.user!.id, profileId, changeIds);
    res.json({ acknowledged });
  }),
);

profileChangesRouter.get(
  "/me/unseen-changes",
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json(await loadUnseenChanges(req.user!.id));
  }),
);
