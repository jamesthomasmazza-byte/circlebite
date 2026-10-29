import path from "node:path";

import express, { type Express } from "express";

/** Vite's build output: every file in assets/ has a content hash in its name (index-oV8t54J6.js),
 *  so a changed file is a new URL and the old one never changes. */
const HASHED_DIR = "assets";

export const IMMUTABLE = "public, max-age=31536000, immutable";
export const REVALIDATE = "no-cache";

/**
 * The built client, as production serves it (app.ts, behind nginx). Two cache rules (2026-10-29):
 *
 * - Hashed files under /assets: cached for a year and never re-checked. A deploy that changes one
 *   gives it a new name, which index.html then points to.
 * - Everything else — index.html, the client-route fallback, anything else at the top of dist —
 *   "no-cache": the browser may keep a copy but must ask first, so a deploy is picked up on the
 *   next load. Before this, everything was "public, max-age=0", so every visit re-checked the
 *   729 kB bundle too.
 *
 * Set in setHeaders, which runs before express.static writes its own Cache-Control and stops it
 * writing one.
 */
export function serveClient(app: Express, clientDist: string): void {
  const hashedDir = path.join(clientDist, HASHED_DIR) + path.sep;
  app.use(
    express.static(clientDist, {
      setHeaders(res, filePath) {
        res.setHeader("Cache-Control", filePath.startsWith(hashedDir) ? IMMUTABLE : REVALIDATE);
      },
    }),
  );
  // Any other GET — a direct load or refresh of a client-side route (/scan, /login, ...) — gets
  // index.html, so it doesn't 404.
  app.get(/.*/, (_req, res) => {
    res.setHeader("Cache-Control", REVALIDATE);
    res.sendFile(path.join(clientDist, "index.html"));
  });
}
