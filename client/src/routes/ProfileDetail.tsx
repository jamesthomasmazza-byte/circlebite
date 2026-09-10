import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import {
  addAllergen,
  createFollowInvite,
  createManagerInvite,
  deleteAllergen,
  deleteProfile,
  getCircle,
  getProfile,
  removeManager,
  revokeFollow,
  updateAllergen,
  updateProfile,
  type CircleData,
  type ProfileDetail as ProfileDetailData,
  type Severity,
  type ShareLevel,
} from "../lib/api";

export function ProfileDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<ProfileDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const [label, setLabel] = useState("");
  const [notes, setNotes] = useState("");
  const [saveError, setSaveError] = useState<string | null>(null);

  const [newName, setNewName] = useState("");
  const [newSeverity, setNewSeverity] = useState<Severity>("moderate");
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
    } catch {
      setSaveError("Couldn't save. Try again.");
    }
  }

  async function handleAddAllergen(event: FormEvent) {
    event.preventDefault();
    setAddError(null);
    if (newName.trim().length === 0) return;
    try {
      await addAllergen(id!, { name: newName.trim(), severity: newSeverity, treatTracesAsUnsafe: newTraces });
      setNewName("");
      await refresh();
    } catch {
      setAddError("Couldn't add that allergen — it may already be on this profile.");
    }
  }

  async function handleAllergenSeverity(allergenId: string, severity: Severity) {
    await updateAllergen(id!, allergenId, { severity });
    await refresh();
  }

  async function handleRemoveAllergen(allergenId: string) {
    await deleteAllergen(id!, allergenId);
    await refresh();
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
      <p>
        <Link to={`/scan?profile=${id}`}>Scan a product for {profile.label}</Link>
        {" · "}
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
      <ul>
        {profile.allergens.map((a) => (
          <li key={a.id}>
            {a.name} — {canManage ? (
              <select value={a.severity} onChange={(e) => handleAllergenSeverity(a.id, e.target.value as Severity)}>
                <option value="mild">Mild</option>
                <option value="moderate">Moderate</option>
                <option value="severe">Severe</option>
              </select>
            ) : (
              a.severity
            )}
            {a.treat_traces_as_unsafe && " · traces treated as unsafe"}
            {canManage && (
              <button type="button" onClick={() => handleRemoveAllergen(a.id)}>
                Remove
              </button>
            )}
          </li>
        ))}
      </ul>

      {canManage && (
        <form onSubmit={handleAddAllergen}>
          <input placeholder="Allergen name" value={newName} onChange={(e) => setNewName(e.target.value)} />
          <select value={newSeverity} onChange={(e) => setNewSeverity(e.target.value as Severity)}>
            <option value="mild">Mild</option>
            <option value="moderate">Moderate</option>
            <option value="severe">Severe</option>
          </select>
          <label>
            <input type="checkbox" checked={newTraces} onChange={(e) => setNewTraces(e.target.checked)} />
            Treat traces as unsafe
          </label>
          {addError && <p role="alert">{addError}</p>}
          <button type="submit">Add allergen</button>
        </form>
      )}

      {canManage && (
        <section>
          <h2>Circle</h2>

          {lastInviteLink && (
            <p>
              Invite link (copy it now — it won't be shown again):{" "}
              <input readOnly value={lastInviteLink} onFocus={(e) => e.target.select()} size={50} />
            </p>
          )}
          {circleError && <p role="alert">{circleError}</p>}

          <h3>Invite someone to follow this profile</h3>
          <form onSubmit={handleCreateFollowInvite}>
            <select value={followShareLevel} onChange={(e) => setFollowShareLevel(e.target.value as ShareLevel)}>
              <option value="all">Full profile</option>
              <option value="severe_only">Severe allergens only</option>
            </select>
            <input
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
              {circle.pendingFollows.length === 0 && circle.pendingManagerInvites.length === 0 && <p>None.</p>}
              <ul>
                {circle.pendingFollows.map((f) => (
                  <li key={f.id}>
                    Follow invite ({f.share_level === "severe_only" ? "severe only" : "full profile"})
                    {f.message && ` — "${f.message}"`}
                  </li>
                ))}
                {circle.pendingManagerInvites.map((m) => (
                  <li key={m.id}>Co-manager invite</li>
                ))}
              </ul>

              <h3>People who can see this profile</h3>
              {circle.followers.length === 0 && circle.managers.length === 0 && <p>Just you, so far.</p>}
              <ul>
                {circle.managers.map((m) => (
                  <li key={m.user_id}>
                    {m.display_name} ({m.email}) — co-manager
                    {isOwner && (
                      <button type="button" onClick={() => handleRemoveManager(m.user_id)}>
                        Remove
                      </button>
                    )}
                  </li>
                ))}
                {circle.followers.map((f) => (
                  <li key={f.id}>
                    {f.display_name} ({f.email}) — follows ({f.share_level === "severe_only" ? "severe only" : "full profile"})
                    <button type="button" onClick={() => handleRevokeFollow(f.id)}>
                      Revoke
                    </button>
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
