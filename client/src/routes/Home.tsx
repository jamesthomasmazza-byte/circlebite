import { Navigate } from "react-router-dom";

import { useAuth } from "../lib/AuthContext";
import { LANDING_PATH } from "../lib/tabs";
import { Landing } from "./Landing";

/** What "/" shows (2026-10-30): the same "Loading…" as RequireAuth while the session is read, so
 *  the landing page never flashes for someone signed in; then Scan if signed in, else the landing. */
export function homeFor(auth: { user: unknown; loading: boolean }): "loading" | "scan" | "landing" {
  if (auth.loading) return "loading";
  return auth.user ? "scan" : "landing";
}

export function Home() {
  const view = homeFor(useAuth());
  if (view === "loading") return <p>Loading…</p>;
  if (view === "scan") return <Navigate to={LANDING_PATH} replace />;
  return <Landing />;
}
