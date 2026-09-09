import { Navigate, Outlet } from "react-router-dom";

import { useAuth } from "./lib/AuthContext";

/**
 * Client-side redirect for UX only — NOT the access boundary. The server's requireAuth
 * middleware (server/src/auth/requireAuth.ts) is what actually protects every API route;
 * this just avoids flashing a protected page before that 401 comes back.
 */
export function RequireAuth() {
  const { user, loading } = useAuth();

  if (loading) return <p>Loading…</p>;
  if (!user) return <Navigate to="/login" replace />;

  return <Outlet />;
}
