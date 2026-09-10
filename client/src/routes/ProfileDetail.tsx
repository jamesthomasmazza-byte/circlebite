import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import {
  addAllergen,
  deleteAllergen,
  deleteProfile,
  getProfile,
  updateAllergen,
  updateProfile,
  type ProfileDetail as ProfileDetailData,
  type Severity,
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

  const canManage = profile.access.level === "owner" || profile.access.level === "co_manager";
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

  return (
    <main>
      <p>
        <Link to="/profiles">← Your profiles</Link>
      </p>
      <h1>{profile.label}</h1>
      <p>Your access: {profile.access.level === "follower" ? `following (${profile.access.shareLevel})` : profile.access.level}</p>

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
