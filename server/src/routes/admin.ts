import { Router } from "express";

import { assertIsAdmin } from "../authorization/admin.js";
import { requireAuth } from "../auth/requireAuth.js";
import { EXTENSION_TO_MIME, resolvePhotoPath } from "../corrections/photoStorage.js";
import { getCorrectionPhotoPath, loadReviewQueue, rejectCorrection } from "../corrections/reviewQueue.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { HttpError } from "../lib/httpError.js";
import { npsReport } from "../nps/npsReport.js";
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

// CONTEST_RULES.md §7 exception (dated 2026-09-25): a narrow NPS admin aggregate — score, counts,
// verbatim reasons only — approved outside the normal "admin analytics beyond AI accuracy" freeze,
// gated identically to /admin/ai-accuracy.
adminRouter.get(
  "/admin/nps",
  requireAuth,
  asyncHandler(async (req, res) => {
    await assertIsAdmin(req.user!.id);
    res.json(await npsReport());
  }),
);

adminRouter.get(
  "/admin/review-queue",
  requireAuth,
  asyncHandler(async (req, res) => {
    await assertIsAdmin(req.user!.id);
    res.json(await loadReviewQueue());
  }),
);

adminRouter.post(
  "/admin/review-queue/corrections/:correctionId/reject",
  requireAuth,
  asyncHandler(async (req, res) => {
    await assertIsAdmin(req.user!.id);

    // reason is legitimately null (that's exactly what the client sends for every remove_caution
    // reject, which never requires one) as well as undefined or a non-empty string — only some
    // other JSON type (number, array, object, boolean) is actually malformed input.
    const { reason } = req.body ?? {};
    if (reason !== undefined && reason !== null && typeof reason !== "string") {
      throw new HttpError(400, "invalid_request");
    }

    const result = await rejectCorrection(req.params.correctionId, req.user!.id, reason ?? null);
    res.json(result);
  }),
);

adminRouter.get(
  "/admin/review-queue/corrections/:correctionId/photo",
  requireAuth,
  asyncHandler(async (req, res) => {
    await assertIsAdmin(req.user!.id);

    // No scan_id join and no assertCanReadProfile — this is the answer to the orphaned-photo trap
    // (migration 0020, scan_id ON DELETE SET NULL): an admin reviewing the queue isn't necessarily
    // a circle member of the reporting profile, and an orphaned correction has no scan to route a
    // profile ACL check through at all. assertIsAdmin above is the only gate this route needs.
    const photoPath = await getCorrectionPhotoPath(req.params.correctionId);
    if (!photoPath) throw new HttpError(404, "not_found");

    const extension = photoPath.split(".").pop() ?? "";
    res.setHeader("Content-Type", EXTENSION_TO_MIME[extension] ?? "application/octet-stream");
    res.sendFile(resolvePhotoPath(photoPath));
  }),
);
