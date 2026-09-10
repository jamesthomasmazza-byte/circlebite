import path from "node:path";
import { fileURLToPath } from "node:url";

import cookieParser from "cookie-parser";
import express, { type Express, type NextFunction, type Request, type Response } from "express";

import { authRouter } from "./auth/routes.js";
import { env } from "./env.js";
import { HttpError } from "./lib/httpError.js";
import { meRouter } from "./routes/me.js";
import { profilesRouter } from "./routes/profiles.js";

// server/dist/app.js -> ../../client/dist (release layout: <release>/server, <release>/client).
const clientDist = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "client",
  "dist",
);

export function createApp(): Express {
  const app = express();

  app.use(express.json());
  app.use(cookieParser());

  app.get("/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.use("/auth", authRouter);
  app.use(meRouter);
  app.use(profilesRouter);

  if (env.isProduction) {
    // In dev, Vite serves the client on :5173 and proxies API calls here. In production, nginx
    // sends everything to this process, so it serves the built client itself: static assets
    // directly, then an index.html fallback for any other GET so a direct load or refresh of a
    // client-side route (/dashboard, /login, ...) doesn't 404.
    app.use(express.static(clientDist));
    app.get(/.*/, (_req, res) => {
      res.sendFile(path.join(clientDist, "index.html"));
    });
  }

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof HttpError) {
      res.status(err.status).json({ error: err.code });
      return;
    }
    console.error(err);
    res.status(500).json({ error: "internal_error" });
  });

  return app;
}
