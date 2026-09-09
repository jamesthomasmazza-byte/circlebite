import { useNavigate } from "react-router-dom";

import { useAuth } from "../lib/AuthContext";

export function Dashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    navigate("/login");
  }

  return (
    <main>
      <h1>Dashboard</h1>
      <p>
        Signed in as {user?.displayName} ({user?.email}).
      </p>
      <p>Profiles you manage, profiles you follow, and recent scans will live here.</p>
      <button onClick={handleLogout}>Log out</button>
    </main>
  );
}
