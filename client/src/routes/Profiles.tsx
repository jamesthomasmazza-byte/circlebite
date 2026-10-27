import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";

import { AllergenPicker, isPicked, pickInput, useAllergenChoices } from "../AllergenPicker";
import { listedAllergenMessage } from "../lib/allergenChoiceCopy";
import { canRemove, emptyDraft, removeDraft, removeLabel, type AllergenDraft } from "../lib/allergenDrafts";
import { CREATE_ONE_BELOW, NO_FOLLOWED_PROFILES, NO_MANAGED_PROFILES } from "../lib/emptyStateCopy";
import { SEVERITY_REQUIRED } from "../lib/severityCopy";
import { SeverityChoice } from "../SeverityChoice";
import { allergenLine } from "../lib/profileLineCopy";
import { ADD_PROFILE_PATH, addFormRequested, profileSection, SECTION_LABEL, sectionHref, visibleSections } from "../lib/profileSections";
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
  const { user, logout } = useAuth();
  const isAdmin = user?.isAdmin === true;
  const section = profileSection(hash, isAdmin);
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
      <h1>Profile</h1>
      {/* One section at a time (lib/profileSections.ts). Admin isn't rendered for anyone else. */}
      <nav className="section-switcher" aria-label="Profile tab sections">
        {visibleSections(isAdmin).map((s) => (
          <Link key={s} to={sectionHref(s)} aria-current={s === section ? "true" : undefined}>
            {SECTION_LABEL[s]}
          </Link>
        ))}
      </nav>
      {loadError && <p role="alert">{loadError}</p>}

      {section === "profiles" && (
        <>
          <section>
            <h2>Profiles you manage</h2>
            {managed.length === 0 && (
              <p>
                {NO_MANAGED_PROFILES} <Link to={ADD_PROFILE_PATH}>{CREATE_ONE_BELOW}</Link>
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

          <section id="add-profile" ref={addSectionRef}>
            {!addOpen ? (
              <button type="button" onClick={() => setAddOpen(true)}>
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
        </>
      )}

      {section === "admin" && (
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

      {section === "account" && (
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
      )}
    </main>
  );
}
