import { Router } from "express";
import multer from "multer";

import { assertCanReadProfile } from "../authorization/profiles.js";
import { requireAuth } from "../auth/requireAuth.js";
import { MAX_PHOTO_BYTES, resolvePhotoPath, savePhotoBuffer, sniffImageType } from "../corrections/photoStorage.js";
import { recordCorrection, type CorrectionType } from "../corrections/recordCorrection.js";
import { pool } from "../db/pool.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { HttpError } from "../lib/httpError.js";

// No router-level .use(requireAuth) here — same reasoning as scansRouter/circleRouter: applied
// per-route so this router can be mounted at bare /api without its auth middleware intercepting
// every other route mounted alongside it before Express checks whether any of its own routes match.
export const correctionsRouter = Router();

const CORRECTION_TYPES = ["flag_wrong", "flag_missing", "wrong_product"] as const;
function isCorrectionType(value: unknown): value is CorrectionType {
  return typeof value === "string" && (CORRECTION_TYPES as readonly string[]).includes(value);
}

const EXTENSION_TO_MIME: Record<string, string> = {
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

// memoryStorage, not diskStorage: the content-type validation (sniffImageType) has to run on the
// actual bytes before anything is written to disk, so the whole (size-capped) file needs to be in
// memory first. multer/busboy enforce limits.fileSize during the stream itself, not after fully
// buffering an oversized file — the cap holds even though this is memory storage.
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_PHOTO_BYTES } });

async function getScanProfileId(scanId: string): Promise<string | null> {
  const { rows } = await pool.query<{ allergen_profile_id: string }>(
    "SELECT allergen_profile_id FROM scans WHERE id = $1",
    [scanId],
  );
  return rows[0]?.allergen_profile_id ?? null;
}

correctionsRouter.post(
  "/scans/:scanId/corrections",
  requireAuth,
  // multer's own errors (e.g. LIMIT_FILE_SIZE) are middleware errors, not something an
  // asyncHandler-wrapped body can catch — translated to a proper HttpError here so a too-large
  // upload gets a 400, not a bare 500 from the generic catch-all.
  (req, res, next) => {
    upload.single("photo")(req, res, (err: unknown) => {
      if (err instanceof multer.MulterError) {
        next(new HttpError(400, err.code === "LIMIT_FILE_SIZE" ? "photo_too_large" : "invalid_upload"));
        return;
      }
      next(err);
    });
  },
  asyncHandler(async (req, res) => {
    const scanId = req.params.scanId;
    const profileId = await getScanProfileId(scanId);
    if (!profileId) throw new HttpError(404, "not_found");

    // assertCanReadProfile, not assertCanManageProfile: reporting a correction is available to any
    // circle member who can see the scan, same reasoning scans.ts already applies to scanning
    // itself — a follower's whole point is being able to act on a profile's behalf, not just view.
    await assertCanReadProfile(req.user!.id, profileId);

    const { correctionType, allergen, note } = req.body ?? {};
    if (!isCorrectionType(correctionType)) throw new HttpError(400, "invalid_request");

    const normalizedAllergen = typeof allergen === "string" && allergen.trim().length > 0 ? allergen.trim() : null;
    if (correctionType === "wrong_product" && normalizedAllergen !== null) {
      throw new HttpError(400, "invalid_request");
    }
    if (correctionType !== "wrong_product" && normalizedAllergen === null) {
      throw new HttpError(400, "invalid_request");
    }

    // Required per docs/legacy-spec.md §6 — not optional, and not something recordCorrection
    // itself enforces (it only knows a photoPath string was supplied), so it's checked here before
    // any file is ever written.
    if (!req.file) throw new HttpError(400, "photo_required");
    const sniffed = sniffImageType(req.file.buffer);
    if (!sniffed) throw new HttpError(400, "invalid_file_type");

    const photoPath = await savePhotoBuffer(req.file.buffer, sniffed.extension);

    const result = await recordCorrection({
      scanId,
      reportedBy: req.user!.id,
      correctionType,
      allergen: normalizedAllergen,
      note: typeof note === "string" && note.trim().length > 0 ? note.trim() : null,
      photoPath,
    });

    res.status(201).json(result);
  }),
);

correctionsRouter.get(
  "/scans/:scanId/corrections/:correctionId/photo",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { scanId, correctionId } = req.params;
    const profileId = await getScanProfileId(scanId);
    if (!profileId) throw new HttpError(404, "not_found");
    await assertCanReadProfile(req.user!.id, profileId);

    // scan_id included in the WHERE, not just the correction's own id — a correctionId that's
    // real but belongs to a different scan (and therefore possibly a profile this user can't see)
    // must not be servable just because the id itself is guessable.
    const { rows } = await pool.query<{ photo_path: string }>(
      "SELECT photo_path FROM product_corrections WHERE id = $1 AND scan_id = $2",
      [correctionId, scanId],
    );
    const row = rows[0];
    if (!row) throw new HttpError(404, "not_found");

    const extension = row.photo_path.split(".").pop() ?? "";
    res.setHeader("Content-Type", EXTENSION_TO_MIME[extension] ?? "application/octet-stream");
    res.sendFile(resolvePhotoPath(row.photo_path));
  }),
);
