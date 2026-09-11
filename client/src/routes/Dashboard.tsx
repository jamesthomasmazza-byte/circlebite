import { Link, useNavigate } from "react-router-dom";

import { useAuth } from "../lib/AuthContext";

export function Dashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  async function handleLogout() {
    try {
      await logout();
    } catch (err) {
      // Local auth state is already cleared either way (see AuthContext.logout) — this is only
      // logged, not surfaced, so a failed server-side revoke doesn't block navigating away.
      console.error("logout request failed", err);
    } finally {
      navigate("/login");
    }
  }

  return (
    <main>
      <h1>Dashboard</h1>
      <p>
        Signed in as {user?.displayName} ({user?.email}).
      </p>
      <p>
        <Link to="/profiles">Profiles you manage and follow</Link>
      </p>
      <p>
        <Link to="/scan">Scan a product</Link>
      </p>
      {user?.isAdmin && (
        <p>
          <Link to="/admin/ai-accuracy">AI accuracy</Link>
        </p>
      )}
      <button onClick={handleLogout}>Log out</button>
    </main>
  );
}
