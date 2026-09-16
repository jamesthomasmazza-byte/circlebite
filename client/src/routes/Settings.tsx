import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { deleteAccount, getDeletionImpact, type DeletionImpactProfile } from "../lib/api";
import { useAuth } from "../lib/AuthContext";

// docs/coppa.md §2.6: "Confirmed with a typed confirmation, not just a button." Every other
// irreversible action in this app is a bare window.confirm() (ProfileDetail.tsx) — deleting the
// whole account, and potentially someone else's access to a profile they didn't choose to give up,
// needs more than that.
export function Settings() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const [profiles, setProfiles] = useState<DeletionImpactProfile[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [confirmText, setConfirmText] = useState("");
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const { profiles: loaded } = await getDeletionImpact();
      setProfiles(loaded);
    } catch {
      setLoadError("Couldn't load what deleting your account would affect. Try reloading this page.");
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const canConfirm = confirmText.trim().toLowerCase() === user?.email.toLowerCase();

  async function handleDeleteAccount() {
    if (!canConfirm) return;
    setDeleteError(null);
    setDeleting(true);
    try {
      await deleteAccount();
      await logout();
      navigate("/login");
    } catch {
      setDeleteError("Couldn't delete your account. Try again.");
      setDeleting(false);
    }
  }

  return (
    <main>
      <p>
        <Link to="/dashboard">← Dashboard</Link>
      </p>
      <h1>Settings</h1>

      <section>
        <h2>Delete your account</h2>
        <p>This permanently deletes your account. It cannot be undone.</p>

        {loadError && <p role="alert">{loadError}</p>}

        {profiles && profiles.length > 0 && (
          <>
            <p>Here's what happens to the profiles you manage:</p>
            <ul>
              {profiles.map((p) => (
                <li key={p.id}>
                  <strong>{p.label}</strong> ({p.scanCount} scan{p.scanCount === 1 ? "" : "s"}) —{" "}
                  {p.outcome.type === "transfer" ? (
                    <>
                      transfers to {p.outcome.newOwner.displayName} ({p.outcome.newOwner.email}), who already
                      co-manages it
                    </>
                  ) : (
                    <>
                      permanently deleted, including its full scan history
                      {p.outcome.followerCount > 0 &&
                        ` — ${p.outcome.followerCount} ${
                          p.outcome.followerCount === 1 ? "person who follows" : "people who follow"
                        } it will lose access`}
                    </>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}

        {profiles && profiles.length === 0 && <p>You don't manage any profiles, so nothing transfers or is destroyed.</p>}

        <p>
          <label>
            Type your email address ({user?.email}) to confirm:
            <br />
            <input
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder={user?.email}
              autoComplete="off"
            />
          </label>
        </p>

        {deleteError && <p role="alert">{deleteError}</p>}

        <button type="button" disabled={!canConfirm || deleting} onClick={handleDeleteAccount}>
          {deleting ? "Deleting…" : "Permanently delete my account"}
        </button>
      </section>
    </main>
  );
}
