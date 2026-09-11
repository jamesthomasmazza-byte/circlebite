import path from "node:path";
import { fileURLToPath } from "node:url";

import cookieParser from "cookie-parser";
import express, { type Express, type NextFunction, type Request, type Response } from "express";

import { authRouter } from "./auth/routes.js";
import { env } from "./env.js";
import { HttpError } from "./lib/httpError.js";
import { adminRouter } from "./routes/admin.js";
import { circleRouter } from "./routes/circle.js";
import { correctionsRouter } from "./routes/corrections.js";
import { meRouter } from "./routes/me.js";
import { profilesRouter } from "./routes/profiles.js";
import { scansRouter } from "./routes/scans.js";

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

  // Node only ever accepts connections from nginx on 127.0.0.1 (scripts/nginx-circlebite.conf
  // already sets X-Real-IP/X-Forwarded-For there) — "loopback" trusts exactly that hop, not an
  // arbitrary forwarded-for chain a client could forge by sending the header straight to Node if
  // this ever ran with a different topology. Without this, req.ip is always nginx's own address
  // (127.0.0.1), which is what auth/rateLimit.ts needs to be the real client IP, not the proxy's.
  app.set("trust proxy", "loopback");

  app.use(express.json());
  app.use(cookieParser());

  app.get("/health", (_req, res) => {
    res.json({ ok: true });
  });

  // Everything API-shaped lives under /api — client page routes and API routes both tend to be
  // named after the resource they concern (a "/profiles" page showing what "/profiles" returns),
  // and without this prefix the two collide: Express would match the API route first, so a direct
  // browser load of a client route with the same name as an API path would get raw JSON instead
  // of the app shell.
  app.use("/api/auth", authRouter);
  app.use("/api", meRouter);
  // Mounted narrowly, not at bare /api: profilesRouter has a router-level requireAuth (.use with
  // no path, matching everything that enters the router) — mounting it at /api would make that
  // middleware intercept every /api/* request, including circleRouter's public routes, before
  // Express even checks whether any of profilesRouter's own routes match.
  app.use("/api/profiles", profilesRouter);
  app.use("/api", circleRouter);
  app.use("/api", scansRouter);
  // Per-route requireAuth, same reasoning as scansRouter/circleRouter above — safe to mount at
  // bare /api.
  app.use("/api", correctionsRouter);
  app.use("/api", adminRouter);

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
