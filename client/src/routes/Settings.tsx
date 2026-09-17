import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";

import { ApiRequestError, changePassword, deleteAccount, getDeletionImpact, type DeletionImpactProfile } from "../lib/api";
import { useAuth } from "../lib/AuthContext";

const CHANGE_PASSWORD_ERROR_COPY: Record<string, string> = {
  too_many_attempts: "Too many attempts. Try again in 15 minutes.",
  invalid_current_password: "That's not your current password.",
  invalid_request: "Check that your new password is at least 8 characters.",
};

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

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);

  async function handleChangePassword(event: FormEvent) {
    event.preventDefault();
    setPasswordError(null);
    setPasswordSuccess(false);

    if (newPassword !== confirmNewPassword) {
      setPasswordError("New passwords don't match.");
      return;
    }

    setChangingPassword(true);
    try {
      await changePassword(currentPassword, newPassword);
      setPasswordSuccess(true);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmNewPassword("");
    } catch (err) {
      if (err instanceof ApiRequestError) {
        setPasswordError(CHANGE_PASSWORD_ERROR_COPY[err.message] ?? "Something went wrong. Try again.");
      } else {
        setPasswordError("Something went wrong. Try again.");
      }
    } finally {
      setChangingPassword(false);
    }
  }

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
        <h2>Change your password</h2>
        <form onSubmit={handleChangePassword}>
          <label>
            Current password
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </label>
          <label>
            New password
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              autoComplete="new-password"
              minLength={8}
              required
            />
          </label>
          <label>
            Confirm new password
            <input
              type="password"
              value={confirmNewPassword}
              onChange={(e) => setConfirmNewPassword(e.target.value)}
              autoComplete="new-password"
              minLength={8}
              required
            />
          </label>
          {passwordError && <p role="alert">{passwordError}</p>}
          {passwordSuccess && <p>Password changed. Your other signed-in devices have been logged out.</p>}
          <button type="submit" disabled={changingPassword}>
            {changingPassword ? "Changing…" : "Change password"}
          </button>
        </form>
      </section>

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
