import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";

import { AllergenPicker, EMPTY_PICK, isPicked, pickInput, useAllergenChoices, type AllergenPick } from "../AllergenPicker";
import { listedAllergenMessage } from "../lib/allergenChoiceCopy";
import { allergenLine } from "../lib/profileLineCopy";
import { useAuth } from "../lib/AuthContext";
import {
  ApiRequestError,
  createProfile,
  listProfiles,
  type AllergenInput,
  type ProfileSummary,
  type Severity,
} from "../lib/api";

type AllergenDraft = { pick: AllergenPick; severity: Severity; treatTracesAsUnsafe: boolean };

function emptyDraft(): AllergenDraft {
  return { pick: EMPTY_PICK, severity: "moderate", treatTracesAsUnsafe: true };
}

export function Profiles() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [managed, setManaged] = useState<ProfileSummary[]>([]);
  const [followed, setFollowed] = useState<ProfileSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [label, setLabel] = useState("");
  const [allergenDrafts, setAllergenDrafts] = useState<AllergenDraft[]>([emptyDraft()]);
  const [createError, setCreateError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const choices = useAllergenChoices();

  useEffect(() => {
    listProfiles()
      .then((res) => {
        setManaged(res.managed);
        setFollowed(res.followed);
      })
      .catch(() => setLoadError("Couldn't load your profiles. Try reloading the page."))
      .finally(() => setLoading(false));
  }, []);

  function updateDraft(index: number, patch: Partial<AllergenDraft>) {
    setAllergenDrafts((drafts) => drafts.map((d, i) => (i === index ? { ...d, ...patch } : d)));
  }

  function removeDraft(index: number) {
    setAllergenDrafts((drafts) => drafts.filter((_, i) => i !== index));
  }

  async function handleCreate(event: FormEvent) {
    event.preventDefault();
    setCreateError(null);

    if (label.trim().length === 0) {
      setCreateError("A profile needs a name.");
      return;
    }

    const allergens: AllergenInput[] = [];
    for (const draft of allergenDrafts) {
      if (!isPicked(draft.pick)) continue;
      allergens.push({
        ...pickInput(draft.pick),
        severity: draft.severity,
        treatTracesAsUnsafe: draft.treatTracesAsUnsafe,
      });
    }

    setSubmitting(true);
    try {
      const profile = await createProfile({ label: label.trim(), allergens });
      navigate(`/profiles/${profile.id}`);
    } catch (err) {
      if (err instanceof ApiRequestError && err.message === "listed_allergen") {
        setCreateError(listedAllergenMessage(null, String(err.detail.displayName)));
      } else {
        setCreateError("Couldn't create the profile. Check the allergens aren't repeated and try again.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  // Moved from the old dashboard (2026-10-23). Local auth state is cleared either way
  // (AuthContext.logout); a failed server-side revoke is only logged, never blocks leaving.
  async function handleLogout() {
    try {
      await logout();
    } catch (err) {
      console.error("logout request failed", err);
    } finally {
      navigate("/login");
    }
  }

  if (loading) return <p>Loading…</p>;

  return (
    <main>
      <h1>Profiles</h1>
      {loadError && <p role="alert">{loadError}</p>}

      <section>
        <h2>Profiles you manage</h2>
        {managed.length === 0 && <p>None yet.</p>}
        <ul>
          {managed.map((p) => (
            <li key={p.id}>
              <Link to={`/profiles/${p.id}`}>{p.label}</Link> ({p.relationship === "owner" ? "owner" : "co-manager"})
              <span className="profile-line">{allergenLine(p)}</span>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2>Profiles you follow</h2>
        {followed.length === 0 && <p>None yet.</p>}
        <ul>
          {followed.map((p) => (
            <li key={p.id}>
              <Link to={`/profiles/${p.id}`}>{p.label}</Link>{" "}
              ({p.share_level === "severe_only" ? "severe allergens only" : "full profile"})
              <span className="profile-line">{allergenLine(p)}</span>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2>Add a profile for someone in your care</h2>
        <form onSubmit={handleCreate}>
          <label>
            Name
            <input value={label} onChange={(e) => setLabel(e.target.value)} required />
          </label>

          <fieldset>
            <legend>Allergens</legend>
            {allergenDrafts.map((draft, i) => (
              <div key={i}>
                {choices && (
                  <AllergenPicker
                    choices={choices}
                    value={draft.pick}
                    onChange={(pick) => updateDraft(i, { pick })}
                    required={false}
                  />
                )}
                <select
                  value={draft.severity}
                  onChange={(e) => updateDraft(i, { severity: e.target.value as Severity })}
                >
                  <option value="mild">Mild</option>
                  <option value="moderate">Moderate</option>
                  <option value="severe">Severe</option>
                </select>
                <label>
                  <input
                    type="checkbox"
                    checked={draft.treatTracesAsUnsafe}
                    onChange={(e) => updateDraft(i, { treatTracesAsUnsafe: e.target.checked })}
                  />
                  Treat "may contain traces" as unsafe
                </label>
                {allergenDrafts.length > 1 && (
                  <button type="button" onClick={() => removeDraft(i)}>
                    Remove
                  </button>
                )}
              </div>
            ))}
            <button type="button" onClick={() => setAllergenDrafts((d) => [...d, emptyDraft()])}>
              Add another allergen
            </button>
          </fieldset>

          {createError && <p role="alert">{createError}</p>}
          <button type="submit" disabled={submitting}>
            Create profile
          </button>
        </form>
      </section>

      {/* The Profile tab's account end (2026-10-23): what the dashboard used to link. */}
      {user?.isAdmin && (
        <section aria-labelledby="admin-heading">
          <h2 id="admin-heading">Admin</h2>
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
        </section>
      )}

      <section aria-labelledby="account-heading">
        <h2 id="account-heading">Account</h2>
        <p>
          Signed in as {user?.displayName} ({user?.email}).
        </p>
        <p>
          <Link to="/settings">Settings</Link>
        </p>
        <button type="button" onClick={handleLogout}>
          Log out
        </button>
      </section>
    </main>
  );
}
