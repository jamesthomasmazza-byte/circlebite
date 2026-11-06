import { useCallback, useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";

import {
  acknowledgeProfileChanges,
  addAllergen,
  ApiRequestError,
  OTHER_ALLERGEN_KEY,
  deleteAllergen,
  deleteProfile,
  getProfile,
  getProfileChanges,
  updateAllergen,
  type AllergenInput,
  type Allergen,
  type ProfileDetail as ProfileDetailData,
  type ProfileHistoryEntry,
} from "../lib/api";
import { AllergenPicker, EMPTY_PICK, isPicked, useAllergenChoices, type AllergenPick } from "../AllergenPicker";
import { AddAllergen } from "../AddAllergen";
import { AllergenItem } from "../AllergenItem";
import { ChangeHistory } from "../ChangeHistory";
import { reviewNotice } from "../lib/allergenChoiceCopy";
import { circleCardHref } from "../lib/inviteCopy";
import { profilePossessive } from "../lib/profileChangeCopy";
import { showScanForButton } from "../lib/tabs";
import { useScanningFor } from "../TabShell";
import { accessNotice } from "../lib/profileLineCopy";

export function ProfileDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { scannableCount } = useScanningFor();
  const [profile, setProfile] = useState<ProfileDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const choices = useAllergenChoices();
  // The allergen whose "Choose another" picker is open, and what's picked in it.
  const [choosingFor, setChoosingFor] = useState<string | null>(null);
  const [replacementPick, setReplacementPick] = useState<AllergenPick>(EMPTY_PICK);
  const [reviewError, setReviewError] = useState<string | null>(null);


  const refresh = useCallback(async () => {
    if (!id) return;
    try {
      const data = await getProfile(id);
      setProfile(data);
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

  // The change history (Prof. Yoest's Oct 1 conditions) — owner and co-managers only; the server
  // 404s followers. A failed load says so rather than showing an empty, reassuring history.
  const [history, setHistory] = useState<ProfileHistoryEntry[] | null>(null);
  const [historyFailed, setHistoryFailed] = useState(false);
  const [ackFailed, setAckFailed] = useState(false);

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

  // Errors go back to the form (AddAllergen.tsx), which says what went wrong.
  async function handleAddAllergen(input: AllergenInput) {
    await addAllergen(id!, input);
    await refresh();
    await refreshHistory();
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

  // Severity, traces or notes, from a row's details (AllergenItem.tsx shows a failure on the row).
  async function handleUpdateAllergen(allergenId: string, input: Partial<AllergenInput>) {
    await updateAllergen(id!, allergenId, input);
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
    setAckFailed(false);
    const shown = (history ?? []).filter((e) => e.unseen).map((e) => e.id);
    try {
      await acknowledgeProfileChanges(id!, shown);
      await refreshHistory();
    } catch {
      setAckFailed(true);
    }
  }

  async function handleDeleteProfile() {
    if (!window.confirm(`Delete ${profile!.label}'s profile? This can't be undone.`)) return;
    await deleteProfile(id!);
    navigate("/profiles");
  }

  // An allergen from before the list (migration 0046) that a manager needs to settle: shown on its
  // row without a tap (AllergenItem.tsx renders it outside the row's details).
  function reviewFor(a: Allergen) {
    if (!canManage || !a.key_needs_review || !choices) return null;
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
  }

  return (
    <main>
      <p>
        <Link to="/profiles">← Your profiles</Link>
      </p>
      <h1>{profile.label}</h1>
      {/* No rename line since 2026-11-06: renaming is in Settings → "Your profiles" (JT, 2026-11-05). */}
      {/* Chooses this profile for Scan and the header on every screen (TabShell.tsx, lib/tabs.ts).
          Only with more than one profile to scan for; with one, the Scan tab already does this. */}
      {showScanForButton(scannableCount) && (
        <p>
          <Link to={`/scan?profile=${id}`} className="button-link">
            Scan for {profile.label}
          </Link>
        </p>
      )}
      <p>
        <Link to={`/profiles/${id}/history`}>Recent scans</Link>
      </p>

      {/* First: what the page is for (2026-10-28 audit — at 390px it
          started about 650px down). Order only. */}
      <h2>Allergens</h2>
      {/* No line naming your role since 2026-11-05: only a severe-only follower is told anything,
          beside the list it qualifies. */}
      {accessNotice(profile.access) && <p role="note">{accessNotice(profile.access)}</p>}
      {/* Compact rows (2026-11-05, AllergenItem.tsx); the "needs a look" notice stays on the row, outside its details. */}
      <ul className="card-list">
        {profile.allergens.map((a) => (
          <AllergenItem
            key={a.id}
            allergen={a}
            canManage={canManage}
            onUpdate={(input) => handleUpdateAllergen(a.id, input)}
            onRemove={() => handleRemoveAllergen(a.id)}
            review={reviewFor(a)}
          />
        ))}
      </ul>

      {canManage && (
        <AddAllergen
          choices={choices}
          startOpen={profile.allergens.length === 0}
          onAdd={handleAddAllergen}
        />
      )}

      {/* No profile-level notes since 2026-11-05 (docs/principles.md): the column and past note
          edits in the change history stay; nothing here reads or writes them. */}

      {canManage && (
        <ChangeHistory
          profileId={id}
          profile={{ label: profile.label, isSelf: profile.is_self }}
          choices={choices ?? []}
          history={history}
          failed={historyFailed}
          ackFailed={ackFailed}
          onAcknowledge={() => void handleAcknowledge()}
        />
      )}

      {/* Invites and who's in the circle live on the Circle tab since 2026-11-05 (CircleManage.tsx);
          id="circle" stays, so an old link still lands here, on the way there. */}
      {canManage && (
        <section id="circle">
          <h2>Circle</h2>
          <p>
            <Link to={circleCardHref(id)}>
              Invite people or manage {profilePossessive({ label: profile.label, isSelf: profile.is_self })} circle
            </Link>
          </p>
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
