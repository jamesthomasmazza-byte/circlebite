import { asyncHandler } from "../lib/asyncHandler.js";
import { SESSION_COOKIE_NAME, validateSession } from "./session.js";

declare global {
  namespace Express {
    interface Request {
      user?: { id: string; email: string; displayName: string; isAdmin: boolean };
      session?: { id: string; actingProfileId: string | null };
    }
  }
}

/**
 * Identity only: confirms who is making the request. It does NOT confirm what they can touch —
 * that's the authorization/ convention (see server/src/authorization/README.md), applied
 * per-resource once resource-scoped routes exist.
 */
export const requireAuth = asyncHandler(async (req, res, next) => {
  const token = req.cookies?.[SESSION_COOKIE_NAME];
  if (typeof token !== "string") {
    res.status(401).json({ error: "unauthenticated" });
    return;
  }

  const validated = await validateSession(token);
  if (!validated) {
    res.status(401).json({ error: "unauthenticated" });
    return;
  }

  req.user = validated.user;
  req.session = { id: validated.sessionId, actingProfileId: validated.actingProfileId };
  next();
});
