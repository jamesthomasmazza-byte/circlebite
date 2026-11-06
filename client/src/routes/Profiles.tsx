import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";

import { AllergenPicker, isPicked, pickInput, useAllergenChoices } from "../AllergenPicker";
import { listedAllergenMessage } from "../lib/allergenChoiceCopy";
import { canRemove, emptyDraft, removeDraft, removeLabel, type AllergenDraft } from "../lib/allergenDrafts";
import { CREATE_ONE, CREATE_ONE_BELOW, NO_FOLLOWED_PROFILES, NO_MANAGED_PROFILES } from "../lib/emptyStateCopy";
import { SEVERITY_REQUIRED } from "../lib/severityCopy";
import { SeverityChoice } from "../SeverityChoice";
import { allergenLine } from "../lib/profileLineCopy";
import { ACCOUNT_PATH, ADD_PROFILE_PATH, addFormRequested, NEW_PROFILE_PATH, oldSectionRedirect } from "../lib/profileSections";
import { useAuth } from "../lib/AuthContext";
import {
  ApiRequestError,
  createProfile,
  listProfiles,
  type AllergenInput,
  type ProfileSummary,
} from "../lib/api";

export function Profiles() {
  const navigate = useNavigate();
  const { hash } = useLocation();
  const { guidedSetupEnabled } = useAuth();
  const [managed, setManaged] = useState<ProfileSummary[]>([]);
  const [followed, setFollowed] = useState<ProfileSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [label, setLabel] = useState("");
  const [allergenDrafts, setAllergenDrafts] = useState<AllergenDraft[]>([emptyDraft()]);
  const [createError, setCreateError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const choices = useAllergenChoices();

  // Folded behind "Add a profile" (2026-10-26). A "Create one" link (/profiles#add-profile) lands
  // with it open, and brings it into view once it's rendered.
  const [addOpen, setAddOpen] = useState(() => addFormRequested(hash));
  const addSectionRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (addFormRequested(hash)) setAddOpen(true);
  }, [hash]);
  useEffect(() => {
    if (addOpen && !loading && addFormRequested(hash)) addSectionRef.current?.scrollIntoView({ block: "start" });
  }, [addOpen, loading, hash]);

  function closeAddForm() {
    setAddOpen(false);
    setLabel("");
    setAllergenDrafts([emptyDraft()]);
    setCreateError(null);
    if (addFormRequested(hash)) navigate("/profiles", { replace: true });
  }

  // A bookmark to the old Account or Admin section (/profiles#account, #admin) goes on to the Account
  // page, replacing this entry so Back doesn't bounce (lib/profileSections.ts).
  useEffect(() => {
    const to = oldSectionRedirect(hash);
    if (to) navigate(to, { replace: true });
  }, [hash, navigate]);

  useEffect(() => {
    listProfiles()
      .then((res) => {
        setManaged(res.managed);
        setFollowed(res.followed);
      })
      .catch(() => setLoadError("Couldn't load your profiles. Try reloading the page."))
      .finally(() => setLoading(false));
  }, []);

  function updateDraft(id: number, patch: Partial<AllergenDraft>) {
    setAllergenDrafts((drafts) => drafts.map((d) => (d.id === id ? { ...d, ...patch } : d)));
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
      if (draft.severity === null) {
        setCreateError(SEVERITY_REQUIRED);
        return;
      }
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

  if (loading) return <p>Loading…</p>;

  return (
    <main>
      <h1>Profile</h1>
      {/* People only since 2026-11-06: the account and its settings are on the Account page. */}
      {loadError && <p role="alert">{loadError}</p>}

      <section>
        <h2>Profiles you manage</h2>
        {managed.length === 0 && (
          <p>
            {NO_MANAGED_PROFILES}{" "}
            {/* With GUIDED_SETUP on, the guided setup; the classic form stays a link away there. */}
            <Link to={guidedSetupEnabled ? NEW_PROFILE_PATH : ADD_PROFILE_PATH}>
              {guidedSetupEnabled ? CREATE_ONE : CREATE_ONE_BELOW}
            </Link>
          </p>
        )}
        {/* Each card is one link (2026-10-26): easier to hit on a phone than the name alone. */}
        <ul className="card-list">
          {managed.map((p) => (
            <li key={p.id}>
              <Link to={`/profiles/${p.id}`} className="card">
                <span className="card__title">{p.label}</span>{" "}
                <span className="card__meta">({p.relationship === "owner" ? "owner" : "co-manager"})</span>
                <span className="profile-line">{allergenLine(p)}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {/* Directly under the profiles you manage (2026-10-27), so adding one sits with them,
          above any you follow. The classic form opens here too. */}
      <section id="add-profile" ref={addSectionRef}>
        {!addOpen ? (
          <button type="button" onClick={() => (guidedSetupEnabled ? navigate(NEW_PROFILE_PATH) : setAddOpen(true))}>
            Add a profile
          </button>
        ) : (
          <>
            <h2>Add a profile for someone in your care</h2>
            <form onSubmit={handleCreate}>
              <label>
                Name
                <input value={label} onChange={(e) => setLabel(e.target.value)} required />
              </label>

              <fieldset>
                <legend>Allergens</legend>
                {allergenDrafts.map((draft) => (
                  <div key={draft.id} className="allergen-draft">
                    {choices && (
                      <AllergenPicker
                        choices={choices}
                        value={draft.pick}
                        onChange={(pick) => updateDraft(draft.id, { pick })}
                        required={false}
                      />
                    )}
                    <SeverityChoice
                      name={`severity-${draft.id}`}
                      value={draft.severity}
                      onChange={(severity) => updateDraft(draft.id, { severity })}
                      required={isPicked(draft.pick)}
                    />
                    <label>
                      <input
                        type="checkbox"
                        checked={draft.treatTracesAsUnsafe}
                        onChange={(e) => updateDraft(draft.id, { treatTracesAsUnsafe: e.target.checked })}
                      />
                      Treat "may contain traces" as unsafe
                    </label>
                    {canRemove(draft, allergenDrafts.length) && (
                      <button type="button" onClick={() => setAllergenDrafts((d) => removeDraft(d, draft.id))}>
                        {removeLabel(draft.pick, choices)}
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
              <button type="button" onClick={closeAddForm}>
                Cancel
              </button>
            </form>
          </>
        )}
      </section>

      <section>
        <h2>Profiles you follow</h2>
        {followed.length === 0 && <p>{NO_FOLLOWED_PROFILES}</p>}
        <ul className="card-list">
          {followed.map((p) => (
            <li key={p.id}>
              <Link to={`/profiles/${p.id}`} className="card">
                <span className="card__title">{p.label}</span>{" "}
                <span className="card__meta">
                  ({p.share_level === "severe_only" ? "severe allergens only" : "full profile"})
                </span>
                <span className="profile-line">{allergenLine(p)}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <p>
        <Link to={ACCOUNT_PATH}>Account &amp; settings</Link>
      </p>
    </main>
  );
}
