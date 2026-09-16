import { Router } from "express";

import { getDeletionImpact } from "../account/deletionImpact.js";
import { requireAuth } from "../auth/requireAuth.js";
import { asyncHandler } from "../lib/asyncHandler.js";

export const meRouter = Router();

meRouter.get("/me", requireAuth, (req, res) => {
  res.json({
    user: req.user,
    actingProfileId: req.session?.actingProfileId ?? null,
  });
});

meRouter.get(
  "/account/deletion-impact",
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json({ profiles: await getDeletionImpact(req.user!.id) });
  }),
);
