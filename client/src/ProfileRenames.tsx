import { useState, type FormEvent } from "react";

import type { ProfileSummary } from "./lib/api";
import { allergenLine } from "./lib/profileLineCopy";
import { PROFILE_NAME_LABEL, RENAME_SAVED, renameableProfiles, saveRename } from "./lib/profileRenameCopy";

type Rename = (id: string, input: { label: string }) => Promise<{ label: string }>;

/**
 * Settings → "Your profiles" (JT, 2026-11-05): one row per profile the user owns or co-manages, each
 * with its own name field and Save. Moved here from the profile page. A follower's profiles never
 * appear, and with none to manage the section isn't shown at all. A rename is an ordinary profile
 * edit, so it still shows in the profile's change history (migration 0038's trigger).
 */
export function ProfileRenames({ list, onRename }: { list: { managed: ProfileSummary[] }; onRename: Rename }) {
  const profiles = renameableProfiles(list);
  if (profiles.length === 0) return null;

  return (
    <section>
      <h2>Your profiles</h2>
      <ul className="card-list">
        {profiles.map((p) => (
          <RenameRow key={p.id} profile={p} onRename={onRename} />
        ))}
      </ul>
    </section>
  );
}

function RenameRow({ profile: p, onRename }: { profile: ProfileSummary; onRename: Rename }) {
  const [saved, setSaved] = useState(p.label);
  const [label, setLabel] = useState(p.label);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [saving, setSaving] = useState(false);

  async function handleSave(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setDone(false);
    setSaving(true);
    const result = await saveRename(p.id, label, onRename);
    setSaving(false);
    if (result.error !== null) {
      setError(result.error);
      return;
    }
    setSaved(result.label);
    setLabel(result.label);
    setDone(true);
  }

  return (
    <li className="card">
      <span className="card__title">{saved}</span>{" "}
      <span className="card__meta">({p.relationship === "owner" ? "owner" : "co-manager"})</span>
      <span className="profile-line">{allergenLine(p)}</span>
      <form onSubmit={handleSave} aria-label={`Rename ${saved}`}>
        <label>
          {PROFILE_NAME_LABEL}
          <input value={label} onChange={(e) => setLabel(e.target.value)} required />
        </label>
        {error && <p role="alert">{error}</p>}
        {done && <p role="status">{RENAME_SAVED}</p>}
        <button type="submit" disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </button>
      </form>
    </li>
  );
}
