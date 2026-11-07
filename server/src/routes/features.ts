import { Router } from "express";

import { env } from "../env.js";

export const featuresRouter = Router();

// Public, no requireAuth (2026-10-27): the switches a signed-out page needs to choose what to show.
// GUIDED_SETUP, so /register can offer the guided sign-up, and REGISTRATION (2026-11-06), so the
// register and landing pages can say sign-up is closed instead of offering it. A switch's on/off and
// nothing else: no account, no data. GET /me carries GUIDED_SETUP for a signed-in page.
featuresRouter.get("/features", (_req, res) => {
  res.json({ guidedSetupEnabled: env.guidedSetup, registrationOpen: env.registration });
});
