import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";

import { AddToCircleSheet } from "../AddToCircleSheet";
import { CircleDiagram, type Bubble } from "../CircleDiagram";
import { AskToFollow, FollowRequests } from "../CircleRequests";
import { CopyLink } from "../CopyLink";
import {
  cancelFollowInvite,
  cancelManagerInvite,
  createFollowInvite,
  createManagerInvite,
  getCircle,
  listProfiles,
  type CircleData,
  type ProfileSummary,
} from "../lib/api";
import { useAuth } from "../lib/AuthContext";
import {
  ADD_BUTTON_PREFIX,
  addTitle,
  canActOnInvite,
  initialCircle,
  initials,
  JOIN_SOMEONE_ELSES,
  members,
  NEW_LINK_NOTE,
  PENDING_LINE,
  pendingInvites,
  pillLabel,
  ROLE_LINE,
  type Pending,
  type Role,
} from "../lib/circleRedesign";
import { CANCEL_FAILED, CANCEL_INVITE, NEW_LINK, NEW_LINK_FAILED } from "../lib/inviteCopy";
import { addProfileHref } from "../lib/profileSections";
import { scanningForId } from "../lib/tabs";
import { useScanningFor } from "../TabShell";

type Profiles = { managed: ProfileSummary[]; followed: ProfileSummary[] };

/**
 * The redesigned Circle tab (JT's mockup, 2026-11-06, behind CIRCLE_REDESIGN; off, routes/Circle.tsx
 * is today's tab). One circle at a time, picked by a pill: each profile you manage or follow. It
 * opens on the profile in "Scanning for", or the one an old /circle#circle-<id> link names.
 *
 * Owners and co-managers see the picture, everyone in the circle and every invite waiting, in one
 * list. Who may do what is the server's (routes/circle.ts); the buttons follow lib/circleRedesign.ts.
 * Follow requests (CIRCLE_REQUESTS) work as on today's tab: an owner's come first, and the form to
 * ask is behind "Joining someone else's circle?".
 */
export function CircleRedesign() {
  const { user, circleRequestsEnabled, guidedSetupEnabled } = useAuth();
  const { chosenProfileId, requests, refreshRequests } = useScanningFor();
  const location = useLocation();
  const [profiles, setProfiles] = useState<Profiles | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [selectedId, setSelectedId] = useState("");
  const [askOpen, setAskOpen] = useState(false);
  // Bumped after a follow request is approved, so the circle shown reads again with its new follower.
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let live = true;
    listProfiles()
      .then((r) => live && setProfiles({ managed: r.managed, followed: r.followed }))
      .catch(() => live && setLoadError(true));
    return () => {
      live = false;
    };
  }, []);

  // The first circle shown, and any later /circle#circle-<id> (an old profile-page link).
  useEffect(() => {
    if (!profiles) return;
    const all = [...profiles.managed, ...profiles.followed];
    const ids = all.map((p) => p.id);
    setSelectedId((current) =>
      location.hash.startsWith("#circle-") || !ids.includes(current)
        ? initialCircle(location.hash, scanningForId(chosenProfileId, all), ids)
        : current,
    );
  }, [profiles, location.hash, chosenProfileId]);

  if (loadError) {
    return (
      <main>
        <h1>Circle</h1>
        <p role="alert">Couldn't load your circles. Reload the page to try again.</p>
      </main>
    );
  }
  if (!profiles) return <p>Loading…</p>;

  const managed = profiles.managed.find((p) => p.id === selectedId);

  return (
    <main className="circle-redesign">
      <h1>Circle</h1>
      <FollowRequests
        requests={requests}
        onChanged={() => {
          refreshRequests();
          setVersion((v) => v + 1);
        }}
      />
      {profiles.managed.length === 0 && profiles.followed.length === 0 && (
        <p>
          You're not in any circle yet. <Link to={addProfileHref(guidedSetupEnabled)}>Add a profile</Link> to invite people to it.
        </p>
      )}

      {profiles.managed.length + profiles.followed.length > 0 && (
        <div className="circle-pills" role="group" aria-label="Which circle">
          {profiles.managed.map((p) => (
            <button key={p.id} type="button" className="circle-pill" aria-pressed={p.id === selectedId} onClick={() => setSelectedId(p.id)}>
              {pillLabel(p, false)}
            </button>
          ))}
          {profiles.followed.map((p) => (
            <button key={p.id} type="button" className="circle-pill" aria-pressed={p.id === selectedId} onClick={() => setSelectedId(p.id)}>
              {pillLabel(p, true)}
            </button>
          ))}
        </div>
      )}

      {/* Keyed by profile, so nothing one circle holds (a new link, an error) shows under another. */}
      {managed && <ManagedCircle key={`${managed.id}-${version}`} profile={managed} viewerId={user?.id} />}

      {circleRequestsEnabled && (
        <p className="circle-join">
          <button type="button" className="link-button" aria-expanded={askOpen} onClick={() => setAskOpen((o) => !o)}>
            {JOIN_SOMEONE_ELSES}
          </button>
        </p>
      )}
      {circleRequestsEnabled && askOpen && <AskToFollow />}
    </main>
  );
}

/** One circle you own or co-manage: the picture, then one list of people and waiting invites. */
function ManagedCircle({ profile, viewerId }: { profile: ProfileSummary; viewerId: string | undefined }) {
  const viewer: Role = profile.relationship === "owner" ? "owner" : "co_manager";
  const [circle, setCircle] = useState<CircleData | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newLink, setNewLink] = useState<{ id: string; url: string } | null>(null);
  const [adding, setAdding] = useState(false);

  async function reload() {
    try {
      setCircle(await getCircle(profile.id));
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile.id]);

  // Cancel, or New link: cancel first, then make one on the same terms, so two links are never
  // live for one invite (as PendingInvites.tsx does on today's tab).
  async function act(p: Pending, replace: boolean) {
    setBusy(p.id);
    setError(null);
    setNewLink(null);
    try {
      try {
        await (p.kind === "follow" ? cancelFollowInvite : cancelManagerInvite)(profile.id, p.id);
      } catch {
        setError(CANCEL_FAILED);
        return;
      }
      if (!replace) return;
      try {
        const made =
          p.kind === "follow"
            ? await createFollowInvite(profile.id, { shareLevel: p.shareLevel!, message: p.message ?? undefined })
            : await createManagerInvite(profile.id);
        setNewLink({ id: made.id, url: `${window.location.origin}/${p.kind === "follow" ? "follow" : "co-manager"}/${made.token}` });
      } catch {
        setError(NEW_LINK_FAILED);
      }
    } finally {
      setBusy(null);
      await reload();
    }
  }

  const heading = profile.is_self ? "Your circle" : `${profile.label}'s circle`;
  if (failed) {
    return (
      <section aria-label={heading}>
        <p role="alert">Couldn't load this circle.</p>
      </section>
    );
  }
  if (!circle) return <p>Loading…</p>;

  const people = members(circle, viewerId);
  const waiting = pendingInvites(circle);
  const bubbles: Bubble[] = [
    ...people.map((m): Bubble => ({ key: m.key, name: m.name, kind: m.isYou ? "you" : "member" })),
    ...waiting.map((p): Bubble => ({ key: p.key, name: "", kind: "pending" })),
  ];

  return (
    <section aria-labelledby="circle-heading">
      <h2 id="circle-heading">{heading}</h2>
      <CircleDiagram centerName={profile.label} bubbles={bubbles} />
      {error && <p role="alert">{error}</p>}

      {/* People, then invites waiting, in one list (JT, 2026-11-06). The diagram is aria-hidden;
          this list is what a screen reader hears. */}
      <ul className="member-list">
        {people.map((m) => (
          <li key={m.key} className="member-row">
            <span className={`member-row__badge${m.isYou ? " member-row__badge--you" : ""}`} aria-hidden="true">
              {m.isYou ? "You" : initials(m.name)}
            </span>
            <span className="member-row__text">
              <span className="member-row__name">{m.name}</span>
              <span className="member-row__role">{ROLE_LINE[m.role]}</span>
            </span>
          </li>
        ))}
        {waiting.map((p) => (
          <li key={p.key} className="member-row member-row--pending">
            <span className="member-row__badge member-row__badge--pending" aria-hidden="true">
              ?
            </span>
            <span className="member-row__text">
              <span className="member-row__name">{PENDING_LINE}</span>
              <span className="member-row__role">{ROLE_LINE[p.role]}</span>
            </span>
            {canActOnInvite(viewer, p.kind) && (
              <span className="member-row__actions">
                <button type="button" disabled={busy !== null} onClick={() => void act(p, true)}>
                  {NEW_LINK}
                </button>
                <button type="button" disabled={busy !== null} onClick={() => void act(p, false)}>
                  {CANCEL_INVITE}
                </button>
                <span className="member-row__note">{NEW_LINK_NOTE}</span>
              </span>
            )}
          </li>
        ))}
        {newLink && (
          <li className="member-row member-row--link">
            <CopyLink url={newLink.url} />
          </li>
        )}
      </ul>

      <p>
        <button type="button" className="button-primary circle-add" onClick={() => setAdding(true)}>
          {ADD_BUTTON_PREFIX}
          {addTitle(profile)}
        </button>
      </p>
      <AddToCircleSheet profile={profile} open={adding} onClose={() => setAdding(false)} onMade={() => void reload()} />
    </section>
  );
}
