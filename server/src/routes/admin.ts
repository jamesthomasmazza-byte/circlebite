import { Router } from "express";

import { assertIsAdmin } from "../authorization/admin.js";
import { requireAuth } from "../auth/requireAuth.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { aiAccuracyReport } from "../verdict/aiAccuracyReport.js";

export const adminRouter = Router();

adminRouter.get(
  "/admin/ai-accuracy",
  requireAuth,
  asyncHandler(async (req, res) => {
    await assertIsAdmin(req.user!.id);
    res.json(await aiAccuracyReport());
  }),
);
