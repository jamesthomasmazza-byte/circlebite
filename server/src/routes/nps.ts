import { Router } from "express";

import { requireAuth } from "../auth/requireAuth.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { HttpError } from "../lib/httpError.js";
import { getCurrentNpsResponse, recordNpsResponse } from "../nps/recordNpsResponse.js";

// No router-level .use(requireAuth) — same reasoning as correctionsRouter/scansRouter: applied
// per-route so this router can be mounted at bare /api without intercepting every other route
// mounted alongside it.
export const npsRouter = Router();

npsRouter.post(
  "/nps",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { score, reason } = req.body ?? {};
    if (typeof score !== "number") throw new HttpError(400, "invalid_request");
    if (reason !== undefined && reason !== null && typeof reason !== "string") {
      throw new HttpError(400, "invalid_request");
    }

    const normalizedReason = typeof reason === "string" && reason.trim().length > 0 ? reason.trim() : null;
    const response = await recordNpsResponse(req.user!.id, score, normalizedReason);
    res.status(201).json(response);
  }),
);

npsRouter.get(
  "/nps/current",
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json({ response: await getCurrentNpsResponse(req.user!.id) });
  }),
);
