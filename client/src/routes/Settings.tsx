import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";

import {
  ApiRequestError,
  changePassword,
  deleteAccount,
  getCurrentNpsResponse,
  getDeletionImpact,
  listProfiles,
  submitNpsResponse,
  updateProfile,
  type DeletionImpactProfile,
  type NpsResponse,
  type ProfileSummary,
} from "../lib/api";
import { useAuth } from "../lib/AuthContext";
import { OVERRIDE_CHOICES, readOverride, regionStatus, saveOverride, type RegionOverride } from "../lib/scannerRegion";
import { ProfileRenames } from "../ProfileRenames";
import { ScanSoundsSetting } from "../ScanSoundsSetting";

const CHANGE_PASSWORD_ERROR_COPY: Record<string, string> = {
  too_many_attempts: "Too many attempts. Try again in 15 minutes.",
  invalid_current_password: "That's not your current password.",
  invalid_request: "Check that your new password is at least 8 characters.",
};

// The Account page (JT, 2026-11-06): everything about the account and its settings, in one place —
// who's signed in, renaming, scan sounds, password, feedback, Admin for an admin, deleting the
// account, and Log out. Moved here from the Profile tab's Account and Admin sections; the path
// stays /settings.
//
// docs/coppa.md §2.6: "Confirmed with a typed confirmation, not just a button." Every other
// irreversible action in this app is a bare window.confirm() (ProfileDetail.tsx) — deleting the
// whole account, and potentially someone else's access to a profile they didn't choose to give up,
// needs more than that.
export function Settings() {
  const { user, logout, scanSoundsEnabled, scannerRegionEnabled } = useAuth();
  const navigate = useNavigate();
  const isAdmin = user?.isAdmin === true;
  // This device's scanner-box override (lib/scannerRegion.ts), for testing on a phone before
  // SCANNER_REGION goes on (docs/server-setup.md §11b). Admins only: the section shows only for
  // them, and the override counts only for them.
  const [regionOverride, setRegionOverride] = useState<RegionOverride>(() => readOverride());
  const [regionSaveFailed, setRegionSaveFailed] = useState(false);

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

  // "Your profiles": renaming moved here from the profile page (JT, 2026-11-05). Only the managed
  // list is used — a follower's profiles aren't renamed here.
  const [managed, setManaged] = useState<ProfileSummary[] | null>(null);
  const [managedError, setManagedError] = useState<string | null>(null);

  useEffect(() => {
    listProfiles()
      .then((list) => setManaged(list.managed))
      .catch(() => setManagedError("Couldn't load your profiles. Try reloading this page."));
  }, []);

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

  // Self-initiated, never a modal: the scan path is a safety flow and must not be interrupted by a
  // survey. `undefined` while loading, `null` once loaded with no current response.
  const [npsResponse, setNpsResponse] = useState<NpsResponse | null | undefined>(undefined);
  const [npsScore, setNpsScore] = useState("");
  const [npsReason, setNpsReason] = useState("");
  const [npsError, setNpsError] = useState<string | null>(null);
  const [submittingNps, setSubmittingNps] = useState(false);

  const refreshNps = useCallback(async () => {
    try {
      const { response } = await getCurrentNpsResponse();
      setNpsResponse(response);
    } catch {
      setNpsError("Couldn't load your feedback. Try reloading this page.");
    }
  }, []);

  useEffect(() => {
    void refreshNps();
  }, [refreshNps]);

  async function handleSubmitNps(event: FormEvent) {
    event.preventDefault();
    setNpsError(null);

    const score = Number(npsScore);
    if (npsScore === "" || !Number.isInteger(score) || score < 0 || score > 10) {
      setNpsError("Pick a score from 0 to 10.");
      return;
    }

    setSubmittingNps(true);
    try {
      const response = await submitNpsResponse(score, npsReason.trim() || null);
      setNpsResponse(response);
    } catch (err) {
      if (err instanceof ApiRequestError && err.message === "already_responded") {
        // Only reachable via a race (e.g. two tabs) — refresh to show the response that won.
        await refreshNps();
      } else {
        setNpsError("Something went wrong. Try again.");
      }
    } finally {
      setSubmittingNps(false);
    }
  }

  // Moved from the old dashboard (2026-10-23), then the Profile tab (2026-11-06). Local auth state is
  // cleared either way (AuthContext.logout); a failed server-side revoke is only logged, never blocks
  // leaving.
  async function handleLogout() {
    try {
      await logout();
    } catch (err) {
      console.error("logout request failed", err);
    } finally {
      navigate("/login");
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
        <Link to="/profiles">← Profiles</Link>
      </p>
      <h1>Account</h1>
      <p>
        Signed in as {user?.displayName} ({user?.email}).
      </p>

      {managedError && <p role="alert">{managedError}</p>}
      {managed && (
        <ProfileRenames
          list={{ managed }}
          onRename={async (profileId, input) => {
            const updated = await updateProfile(profileId, input);
            // The delete section below names each profile too.
            void refresh();
            return updated;
          }}
        />
      )}

      {/* Behind SCAN_SOUNDS (2026-11-05): with the switch off there's no setting and no sound. Here
          since 2026-11-06, moved from Profile → Account unchanged, its line beside the toggle. */}
      {scanSoundsEnabled && (
        <section>
          <h2>Scan sounds</h2>
          <ScanSoundsSetting />
        </section>
      )}

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
        <h2>Feedback</h2>

        {npsResponse === undefined && !npsError && <p>Loading…</p>}

        {npsError && <p role="alert">{npsError}</p>}

        {npsResponse ? (
          <p>
            You told us a {npsResponse.score} out of 10 on{" "}
            {new Date(npsResponse.createdAt).toLocaleDateString()}. Thanks — we'll ask again later.
          </p>
        ) : (
          npsResponse === null && (
            <form onSubmit={handleSubmitNps}>
              <label>
                How likely is it that you would recommend CircleBite to a friend or colleague?
                <br />
                <select value={npsScore} onChange={(e) => setNpsScore(e.target.value)} required>
                  <option value="" disabled>
                    Choose a score
                  </option>
                  {Array.from({ length: 11 }, (_, score) => (
                    <option key={score} value={score}>
                      {score}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                What's the primary reason for your score? (optional)
                <br />
                <textarea value={npsReason} onChange={(e) => setNpsReason(e.target.value)} rows={3} />
              </label>
              <button type="submit" disabled={submittingNps}>
                {submittingNps ? "Sending…" : "Send feedback"}
              </button>
            </form>
          )
        )}
      </section>

      {/* Admins only; the server's /admin routes 404 for anyone else. */}
      {isAdmin && (
        <section>
          <h2>Admin</h2>
          <ul>
            <li>
              <Link to="/admin/ai-accuracy">AI accuracy</Link>
            </li>
            <li>
              <Link to="/admin/review-queue">Review queue</Link>
            </li>
            <li>
              <Link to="/admin/nps">NPS</Link>
            </li>
          </ul>
          <fieldset>
            <legend>Decode only inside the box, this device</legend>
            {OVERRIDE_CHOICES.map((c) => (
              <label key={c.value}>
                <input
                  type="radio"
                  name="scanner-region"
                  value={c.value}
                  checked={regionOverride === c.value}
                  onChange={() => {
                    setRegionSaveFailed(!saveOverride(c.value));
                    setRegionOverride(readOverride());
                  }}
                />
                {c.label}
              </label>
            ))}
          </fieldset>
          <p role="status">
            Scanner on this device: {regionStatus(scannerRegionEnabled, isAdmin, regionOverride)}
          </p>
          {regionSaveFailed && <p role="alert">This browser can't keep the choice, so the server's setting applies.</p>}
        </section>
      )}

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

      <p>
        <button type="button" onClick={handleLogout}>
          Log out
        </button>
      </p>
    </main>
  );
}
