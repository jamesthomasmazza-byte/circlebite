import { Router } from "express";

import { deleteAccount } from "../account/deleteAccount.js";
import { getDeletionImpact } from "../account/deletionImpact.js";
import { requireAuth } from "../auth/requireAuth.js";
import { SESSION_COOKIE_NAME } from "../auth/session.js";
import { env } from "../env.js";
import { asyncHandler } from "../lib/asyncHandler.js";

export const meRouter = Router();

meRouter.get("/me", requireAuth, (req, res) => {
  res.json({
    user: req.user,
    actingProfileId: req.session?.actingProfileId ?? null,
    // Path C's kill switch, surfaced here rather than a dedicated endpoint — this is already the
    // one request the client makes at every mount (AuthContext.tsx), so this is a free field, not
    // a new round trip. The route itself (POST /scans/label) still checks env.labelScan
    // independently and is the actual enforcement; this is what keeps the client from ever
    // offering an entry point the server would just 404.
    labelScanEnabled: env.labelScan,
  });
});

meRouter.get(
  "/account/deletion-impact",
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json({ profiles: await getDeletionImpact(req.user!.id) });
  }),
);

// docs/coppa.md §2.6. deleteAccount() already cascades the user's own sessions away, so there's no
// session row left to revoke by the time this responds — just clear the cookie, same as /logout.
meRouter.delete(
  "/account",
  requireAuth,
  asyncHandler(async (req, res) => {
    await deleteAccount(req.user!.id);
    res.clearCookie(SESSION_COOKIE_NAME, { path: "/" });
    res.status(204).end();
  }),
);
