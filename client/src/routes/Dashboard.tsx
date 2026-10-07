import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { getUnseenChanges, type UnseenProfileChanges } from "../lib/api";
import { useAuth } from "../lib/AuthContext";
import { profilePossessive, unseenBannerLine } from "../lib/profileChangeCopy";

export function Dashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [unseen, setUnseen] = useState<UnseenProfileChanges[]>([]);
  const [unseenFailed, setUnseenFailed] = useState(false);

  // Prof. Yoest's Oct 1 condition: an owner must never learn about a change by accident. This is
  // the page they land on after signing in, so the notice lives here, and it stays until they've
  // acknowledged the entries on the profile page — there's no dismiss button. A failed check says
  // so: silently showing nothing would read as "nothing changed".
  useEffect(() => {
    getUnseenChanges()
      .then(setUnseen)
      .catch(() => setUnseenFailed(true));
  }, []);

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
      {unseen.length > 0 && (
        <section className="change-notice" aria-labelledby="change-notice-heading">
          <h2 id="change-notice-heading">Changes to review</h2>
          <ul>
            {unseen.map((u) => (
              <li key={u.profileId}>
                {unseenBannerLine(u)}{" "}
                <Link to={`/profiles/${u.profileId}#changes`}>Review changes to {profilePossessive(u)} profile</Link>
              </li>
            ))}
          </ul>
        </section>
      )}
      {unseenFailed && (
        <p role="alert">Couldn't check whether anyone changed your profiles. Reload the page to try again.</p>
      )}
      <p>
        <Link to="/profiles">Profiles you manage and follow</Link>
      </p>
      <p>
        <Link to="/scan">Scan a product</Link>
      </p>
      <p>
        <Link to="/settings">Settings</Link>
      </p>
      {user?.isAdmin && (
        <p>
          <Link to="/admin/ai-accuracy">AI accuracy</Link>
        </p>
      )}
      {user?.isAdmin && (
        <p>
          <Link to="/admin/nps">NPS</Link>
        </p>
      )}
      <button onClick={handleLogout}>Log out</button>
    </main>
  );
}
