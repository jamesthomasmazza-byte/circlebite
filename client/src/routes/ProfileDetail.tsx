import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";

import {
  acknowledgeProfileChanges,
  addAllergen,
  ApiRequestError,
  OTHER_ALLERGEN_KEY,
  createFollowInvite,
  createManagerInvite,
  deleteAllergen,
  deleteProfile,
  getCircle,
  getProfile,
  getProfileChanges,
  profileChangePhotoUrl,
  removeManager,
  revokeFollow,
  updateAllergen,
  updateProfile,
  type CircleData,
  type ProfileDetail as ProfileDetailData,
  type ProfileHistoryEntry,
  type Severity,
  type ShareLevel,
} from "../lib/api";
import { AllergenPicker, EMPTY_PICK, isPicked, pickInput, useAllergenChoices, type AllergenPick } from "../AllergenPicker";
import { CopyLink } from "../CopyLink";
import { useAuth } from "../lib/AuthContext";
import { listedAllergenMessage, reviewNotice } from "../lib/allergenChoiceCopy";
import { NO_PENDING_INVITES, PROFILE_CIRCLE_JUST_YOU } from "../lib/emptyStateCopy";
import { describeChange } from "../lib/profileChangeCopy";
import { PendingInvites } from "../PendingInvites";
import { shortDateTime } from "../lib/dateCopy";
import { SEVERITY_REQUIRED } from "../lib/severityCopy";
import { SeverityChoice } from "../SeverityChoice";

export function ProfileDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const [profile, setProfile] = useState<ProfileDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const [label, setLabel] = useState("");
  const [notes, setNotes] = useState("");
  const [saveError, setSaveError] = useState<string | null>(null);

  const [newPick, setNewPick] = useState<AllergenPick>(EMPTY_PICK);
  const choices = useAllergenChoices();
  // The allergen whose "Choose another" picker is open, and what's picked in it.
  const [choosingFor, setChoosingFor] = useState<string | null>(null);
  const [replacementPick, setReplacementPick] = useState<AllergenPick>(EMPTY_PICK);
  const [reviewError, setReviewError] = useState<string | null>(null);
  // Unset until a manager chooses (lib/severityCopy.ts), and unset again after each add.
  const [newSeverity, setNewSeverity] = useState<Severity | null>(null);
  const [newTraces, setNewTraces] = useState(true);
  const [addError, setAddError] = useState<string | null>(null);

  const [circle, setCircle] = useState<CircleData | null>(null);
  const [followShareLevel, setFollowShareLevel] = useState<ShareLevel>("all");
  const [followMessage, setFollowMessage] = useState("");
  const [lastInviteLink, setLastInviteLink] = useState<string | null>(null);
  const [circleError, setCircleError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!id) return;
    try {
      const data = await getProfile(id);
      setProfile(data);
      setLabel(data.label);
      setNotes(data.notes ?? "");
    } catch {
      setNotFound(true);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const canManage = profile?.access.level === "owner" || profile?.access.level === "co_manager";

  const refreshCircle = useCallback(async () => {
    if (!id || !canManage) return;
    try {
      setCircle(await getCircle(id));
    } catch {
      // The circle section just stays empty — the profile itself already loaded fine, so this
      // isn't worth a page-level error.
    }
  }, [id, canManage]);

  useEffect(() => {
    void refreshCircle();
  }, [refreshCircle]);

  // The change history (Prof. Yoest's Oct 1 conditions) — owner and co-managers only; the server
  // 404s followers. A failed load says so rather than showing an empty, reassuring history.
  const [history, setHistory] = useState<ProfileHistoryEntry[] | null>(null);
  const [historyFailed, setHistoryFailed] = useState(false);
  const [ackError, setAckError] = useState<string | null>(null);

  const refreshHistory = useCallback(async () => {
    if (!id || !canManage) return;
    try {
      setHistory(await getProfileChanges(id));
      setHistoryFailed(false);
    } catch {
      setHistoryFailed(true);
    }
  }, [id, canManage]);

  useEffect(() => {
    void refreshHistory();
  }, [refreshHistory]);

  // Arriving from the dashboard notice (/profiles/:id#changes): the router doesn't scroll to a hash
  // on its own, and the section only exists once the history has loaded. "instant", not the
  // stylesheet's smooth scrolling: a smooth scroll is an animation, and Chrome doesn't run it in a
  // tab that isn't visible — switch tabs while this loads and the parent lands at the top of the
  // page with the history out of sight (found in testing, Oct 7). Arriving on an anchor is a jump.
  useEffect(() => {
    if (history && location.hash === "#changes") {
      document.getElementById("changes")?.scrollIntoView({ behavior: "instant", block: "start" });
    }
  }, [history, location.hash]);

  if (loading) return <p>Loading…</p>;
  // Deliberately the same message whether the profile doesn't exist or just isn't visible to
  // this user — the server already treats those as identical (404 either way).
  if (notFound || !profile || !id) {
    return (
      <main>
        <p>That profile doesn't exist, or you don't have access to it.</p>
        <Link to="/profiles">Back to your profiles</Link>
      </main>
    );
  }

  const isOwner = profile.access.level === "owner";

  async function handleSaveDetails(event: FormEvent) {
    event.preventDefault();
    setSaveError(null);
    try {
      const updated = await updateProfile(id!, { label: label.trim(), notes: notes.trim() });
      setProfile((p) => (p ? { ...p, label: updated.label, notes: updated.notes } : p));
      await refreshHistory();
    } catch {
      setSaveError("Couldn't save. Try again.");
    }
  }

  async function handleAddAllergen(event: FormEvent) {
    event.preventDefault();
    setAddError(null);
    if (!isPicked(newPick)) return;
    if (newSeverity === null) {
      setAddError(SEVERITY_REQUIRED);
      return;
    }
    try {
      await addAllergen(id!, { ...pickInput(newPick), severity: newSeverity, treatTracesAsUnsafe: newTraces });
      setNewPick(EMPTY_PICK);
      setNewSeverity(null);
      await refresh();
      await refreshHistory();
    } catch (err) {
      setAddError(
        err instanceof ApiRequestError && err.message === "listed_allergen"
          ? listedAllergenMessage(newPick.otherName.trim(), String(err.detail.displayName))
          : "Couldn't add that allergen — it may already be on this profile.",
      );
    }
  }

  // Settles an allergen from before the list (migration 0046): keep the match (a rename to the
  // list's name, logged as this manager's edit), choose another, or keep an unlisted name as typed.
  async function handleSettleAllergen(allergenId: string, key: string) {
    setReviewError(null);
    try {
      await updateAllergen(id!, allergenId, { key });
      setChoosingFor(null);
      setReplacementPick(EMPTY_PICK);
      await refresh();
      await refreshHistory();
    } catch (err) {
      setReviewError(
        err instanceof ApiRequestError && err.message === "duplicate_allergen"
          ? "That allergen is already on this profile. Remove this one instead."
          : "Couldn't save that. Try again.",
      );
    }
  }

  async function handleAllergenSeverity(allergenId: string, severity: Severity) {
    await updateAllergen(id!, allergenId, { severity });
    await refresh();
    await refreshHistory();
  }

  async function handleRemoveAllergen(allergenId: string) {
    await deleteAllergen(id!, allergenId);
    await refresh();
    await refreshHistory();
  }

  // Acknowledges exactly the unseen entries on screen — never "everything up to now", which could
  // swallow one that arrived after this page loaded (migration 0040).
  async function handleAcknowledge() {
    setAckError(null);
    const shown = (history ?? []).filter((e) => e.unseen).map((e) => e.id);
    try {
      await acknowledgeProfileChanges(id!, shown);
      await refreshHistory();
    } catch {
      setAckError("Couldn't record that. Try again.");
    }
  }

  async function handleDeleteProfile() {
    if (!window.confirm(`Delete ${profile!.label}'s profile? This can't be undone.`)) return;
    await deleteProfile(id!);
    navigate("/profiles");
  }

  async function handleCreateFollowInvite(event: FormEvent) {
    event.preventDefault();
    setCircleError(null);
    try {
      const { token } = await createFollowInvite(id!, {
        shareLevel: followShareLevel,
        message: followMessage.trim() || undefined,
      });
      // Shown once — the server never returns the raw token again after this response.
      setLastInviteLink(`${window.location.origin}/follow/${token}`);
      setFollowMessage("");
      await refreshCircle();
    } catch {
      setCircleError("Couldn't create the invite. Try again.");
    }
  }

  async function handleCreateManagerInvite() {
    setCircleError(null);
    try {
      const { token } = await createManagerInvite(id!);
      setLastInviteLink(`${window.location.origin}/co-manager/${token}`);
      await refreshCircle();
    } catch {
      setCircleError("Couldn't create the invite. Try again.");
    }
  }

  async function handleRevokeFollow(followId: string) {
    await revokeFollow(id!, followId);
    await refreshCircle();
  }

  async function handleRemoveManager(userId: string) {
    if (!window.confirm("Remove this co-manager's access?")) return;
    await removeManager(id!, userId);
    await refreshCircle();
  }

  return (
    <main>
      <p>
        <Link to="/profiles">← Your profiles</Link>
      </p>
      <h1>{profile.label}</h1>
      <p>Your access: {profile.access.level === "follower" ? `following (${profile.access.shareLevel})` : profile.access.level}</p>
      {/* Chooses this profile for Scan and the header on every screen (TabShell.tsx, lib/tabs.ts). */}
      <p>
        <Link to={`/scan?profile=${id}`} className="button-link">
          Scan for {profile.label}
        </Link>
      </p>
      <p>
        <Link to={`/profiles/${id}/history`}>Recent scans</Link>
      </p>

      {canManage ? (
        <form onSubmit={handleSaveDetails}>
          <label>
            Name
            <input value={label} onChange={(e) => setLabel(e.target.value)} required />
          </label>
          <label>
            Notes
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
          </label>
          {saveError && <p role="alert">{saveError}</p>}
          <button type="submit">Save</button>
        </form>
      ) : (
        profile.notes && <p>{profile.notes}</p>
      )}

      <h2>Allergens</h2>
      <ul className="card-list">
        {profile.allergens.map((a) => (
          <li key={a.id} className="card">
            {a.name} — {canManage ? (
              <select
                aria-label={`Severity of ${a.name}`}
                value={a.severity}
                onChange={(e) => handleAllergenSeverity(a.id, e.target.value as Severity)}
              >
                <option value="mild">Mild</option>
                <option value="moderate">Moderate</option>
                <option value="severe">Severe</option>
              </select>
            ) : (
              a.severity
            )}
            {a.treat_traces_as_unsafe && " · traces treated as unsafe"}
            {/* On its own line, never wrapped into the sentence above (the visual pass, 2026-10-26). */}
            {canManage && (
              <p className="card__actions">
                <button type="button" onClick={() => handleRemoveAllergen(a.id)}>
                  Remove
                </button>
              </p>
            )}
            {canManage && a.key_needs_review && choices && (() => {
              const notice = reviewNotice(a, choices.find((c) => c.key === a.allergen_key));
              return (
                <div role="note" className="allergen-review">
                  <p>{notice.text}</p>
                  {notice.hint && <p className="allergen-picker__hint">{notice.hint}</p>}
                  {choosingFor === a.id ? (
                    <>
                      <AllergenPicker
                        choices={choices}
                        value={replacementPick}
                        onChange={setReplacementPick}
                        allowOther={false}
                        label={`Replace “${a.name}” with`}
                      />
                      <button
                        type="button"
                        disabled={!isPicked(replacementPick)}
                        onClick={() => handleSettleAllergen(a.id, replacementPick.key)}
                      >
                        Use this
                      </button>{" "}
                      <button type="button" onClick={() => setChoosingFor(null)}>
                        Cancel
                      </button>
                    </>
                  ) : (
                    <p>
                      {notice.keepLabel && (
                        <button
                          type="button"
                          onClick={() => handleSettleAllergen(a.id, a.allergen_key ?? OTHER_ALLERGEN_KEY)}
                        >
                          {notice.keepLabel}
                        </button>
                      )}{" "}
                      <button
                        type="button"
                        onClick={() => {
                          setChoosingFor(a.id);
                          setReplacementPick(EMPTY_PICK);
                        }}
                      >
                        {notice.chooseLabel}
                      </button>
                    </p>
                  )}
                  {reviewError && <p role="alert">{reviewError}</p>}
                </div>
              );
            })()}
          </li>
        ))}
      </ul>

      {canManage && (
        <form onSubmit={handleAddAllergen}>
          {choices && <AllergenPicker choices={choices} value={newPick} onChange={setNewPick} label="Add an allergen" />}
          <SeverityChoice name="new-allergen-severity" value={newSeverity} onChange={setNewSeverity} required />
          <label>
            <input type="checkbox" checked={newTraces} onChange={(e) => setNewTraces(e.target.checked)} />
            Treat traces as unsafe
          </label>
          {addError && <p role="alert">{addError}</p>}
          <button type="submit">Add allergen</button>
        </form>
      )}

      {canManage && (
        <section id="changes" className="change-history" aria-labelledby="change-history-heading">
          <h2 id="change-history-heading">Change history</h2>
          {historyFailed && <p role="alert">Couldn't load this profile's change history. Reload the page to try again.</p>}
          {history && history.length === 0 && <p>No changes recorded yet.</p>}
          {history && history.some((e) => e.unseen) && (
            <p>
              <button type="button" onClick={handleAcknowledge}>
                I've seen these
              </button>
            </p>
          )}
          {ackError && <p role="alert">{ackError}</p>}
          {history && history.length > 0 && (
            <ol className="change-history__list">
              {history.map((e) => {
                const d = describeChange(e, { label: profile.label, isSelf: profile.is_self }, choices ?? []);
                return (
                  <li key={e.id} className="change-entry" data-unseen={e.unseen ? "true" : undefined}>
                    <p className="change-entry__meta">
                      {e.unseen && <strong className="change-entry__new">New · </strong>}
                      <time dateTime={e.createdAt}>{shortDateTime(e.createdAt)}</time>
                    </p>
                    <p className="change-entry__headline">{d.headline}</p>
                    {d.details.map((line) => (
                      <p key={line}>{line}</p>
                    ))}
                    {d.check && <p className="change-entry__check">{d.check}</p>}
                    {e.downgrade?.scannedAt && <p>Scanned {new Date(e.downgrade.scannedAt).toLocaleDateString()}.</p>}
                    {e.downgrade?.hasPhoto && (
                      <p>
                        <a href={profileChangePhotoUrl(id, e.id)} target="_blank" rel="noreferrer">
                          Label photo sent with the report
                        </a>
                      </p>
                    )}
                    {d.consequences.map((line) => (
                      <p key={line} className="change-entry__consequence">
                        {line}
                      </p>
                    ))}
                    {d.status && <p className="change-entry__status">{d.status}</p>}
                  </li>
                );
              })}
            </ol>
          )}
        </section>
      )}

      {canManage && (
        <section id="circle">
          <h2>Circle</h2>

          {lastInviteLink && <CopyLink url={lastInviteLink} />}
          {circleError && <p role="alert">{circleError}</p>}

          <h3>Invite someone to follow this profile</h3>
          <form onSubmit={handleCreateFollowInvite}>
            <select
              aria-label="What they can see"
              value={followShareLevel}
              onChange={(e) => setFollowShareLevel(e.target.value as ShareLevel)}
            >
              <option value="all">Full profile</option>
              <option value="severe_only">Severe allergens only</option>
            </select>
            <input
              aria-label="Message (optional)"
              placeholder="Message (optional)"
              value={followMessage}
              onChange={(e) => setFollowMessage(e.target.value)}
            />
            <button type="submit">Create invite link</button>
          </form>

          <p>
            <button type="button" onClick={handleCreateManagerInvite}>
              Invite a co-manager
            </button>
          </p>

          {circle && (
            <>
              <h3>Pending invites</h3>
              {circle.pendingFollows.length === 0 && circle.pendingManagerInvites.length === 0 ? (
                <p>{NO_PENDING_INVITES}</p>
              ) : (
                <PendingInvites
                  profileId={id!}
                  circle={circle}
                  isOwner={isOwner}
                  viewerId={user?.id}
                  onChanged={refreshCircle}
                />
              )}

              <h3>People who can see this profile</h3>
              {circle.followers.length === 0 && circle.managers.length === 0 && <p>{PROFILE_CIRCLE_JUST_YOU}</p>}
              <ul className="card-list">
                {circle.managers.map((m) => (
                  <li key={m.user_id} className="card">
                    {m.display_name} — co-manager
                    <span className="card__meta card__line">{m.email}</span>
                    {isOwner && (
                      <p className="card__actions">
                        <button type="button" onClick={() => handleRemoveManager(m.user_id)}>
                          Remove
                        </button>
                      </p>
                    )}
                  </li>
                ))}
                {circle.followers.map((f) => (
                  <li key={f.id} className="card">
                    {f.display_name} — follows ({f.share_level === "severe_only" ? "severe only" : "full profile"})
                    <span className="card__meta card__line">{f.email}</span>
                    <p className="card__actions">
                      <button type="button" onClick={() => handleRevokeFollow(f.id)}>
                        Revoke
                      </button>
                    </p>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}

      {isOwner && (
        <p>
          <button type="button" onClick={handleDeleteProfile}>
            Delete this profile
          </button>
        </p>
      )}
    </main>
  );
}
