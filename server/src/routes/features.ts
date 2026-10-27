import { Router } from "express";

import { env } from "../env.js";

export const featuresRouter = Router();

// Public, no requireAuth (2026-10-27): the switches a signed-out page needs to choose what to show.
// Today only GUIDED_SETUP, so /register can offer the guided sign-up. A switch's on/off and nothing
// else: no account, no data. GET /me carries the same flags for a signed-in page.
featuresRouter.get("/features", (_req, res) => {
  res.json({ guidedSetupEnabled: env.guidedSetup });
});
