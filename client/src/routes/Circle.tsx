import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { AskToFollow, FollowRequests } from "../CircleRequests";
import { getCircle, listProfiles, type CircleData, type ProfileSummary } from "../lib/api";
import { useAuth } from "../lib/AuthContext";
import { CIRCLE_JUST_YOU } from "../lib/emptyStateCopy";
import { profilePossessive } from "../lib/profileChangeCopy";
import { ADD_PROFILE_PATH } from "../lib/profileSections";
import { PendingInvites } from "../PendingInvites";
import { useScanningFor } from "../TabShell";

type ManagedCircle = { profile: ProfileSummary; circle: CircleData | null };

/** "Sam — owner" on a circle you co-manage; nothing on your own, where it would only say "You". */
export function circleOwnerLine(circle: Pick<CircleData, "owner">, viewerId: string | undefined): string | null {
  if (!circle.owner || circle.owner.user_id === viewerId) return null;
  return `${circle.owner.display_name} — owner`;
}

/**
 * The Circle tab (2026-10-23): for each profile you manage, who's in its circle and which invites
 * nobody has accepted yet; then the profiles you follow. Invites waiting can be cancelled or given a
 * new link here (2026-10-26, PendingInvites.tsx); making invites and removing people stay on the
 * profile page, one link away.
 *
 * With CIRCLE_REQUESTS on (2026-10-27): an owner's follow requests come first, to approve or
 * decline (CircleRequests.tsx; the shell holds them, for Scan's notice and this tab's badge), and
 * anyone can ask to follow a parent's profile at the bottom. Invites work exactly as before.
 */
export function Circle() {
  const { user, circleRequestsEnabled } = useAuth();
  const { requests, refreshRequests } = useScanningFor();
  const [managed, setManaged] = useState<ManagedCircle[] | null>(null);
  const [followed, setFollowed] = useState<ProfileSummary[]>([]);
  const [loadError, setLoadError] = useState(false);

  // After an approval the new follower shows in that circle, so every circle is read again.
  async function afterRequestDecided() {
    refreshRequests();
    if (!managed) return;
    const circles = await Promise.all(
      managed.map(async (m) => ({ profile: m.profile, circle: await getCircle(m.profile.id).catch(() => null) })),
    );
    setManaged(circles);
  }

  // After a Cancel or New link: that one circle, read again.
  async function reloadCircle(profileId: string) {
    const circle = await getCircle(profileId).catch(() => null);
    setManaged((all) => all?.map((m) => (m.profile.id === profileId ? { ...m, circle } : m)) ?? all);
  }

  useEffect(() => {
    let live = true;
    listProfiles()
      .then(async (r) => {
        const circles = await Promise.all(
          r.managed.map(async (profile) => ({ profile, circle: await getCircle(profile.id).catch(() => null) })),
        );
        if (!live) return;
        setManaged(circles);
        setFollowed(r.followed);
      })
      .catch(() => live && setLoadError(true));
    return () => {
      live = false;
    };
  }, []);

  if (loadError) {
    return (
      <main>
        <h1>Circle</h1>
        <p role="alert">Couldn't load your circles. Reload the page to try again.</p>
      </main>
    );
  }
  if (!managed) return <p>Loading…</p>;

  return (
    <main>
      <h1>Circle</h1>
      <FollowRequests requests={requests} onChanged={() => void afterRequestDecided()} />
      {managed.length === 0 && followed.length === 0 && (
        <p>
          You're not in any circle yet. <Link to={ADD_PROFILE_PATH}>Add a profile</Link> to invite people to it.
        </p>
      )}

      {managed.map(({ profile, circle }) => {
        const whose = profilePossessive({ label: profile.label, isSelf: profile.is_self });
        const waiting = circle ? circle.pendingFollows.length + circle.pendingManagerInvites.length : 0;
        return (
          <section key={profile.id} className="circle-card" aria-labelledby={`circle-${profile.id}`}>
            <h2 id={`circle-${profile.id}`}>{profile.is_self ? "Your circle" : `${profile.label}'s circle`}</h2>
            {!circle ? (
              <p role="alert">Couldn't load this circle.</p>
            ) : (
              <>
                {circle.managers.length === 0 && circle.followers.length === 0 ? (
                  <p>{CIRCLE_JUST_YOU}</p>
                ) : (
                  <ul className="row-list">
                    {/* Someone else's profile that you co-manage: say whose (circleOwnerLine). */}
                    {circleOwnerLine(circle, user?.id) && <li>{circleOwnerLine(circle, user?.id)}</li>}
                    {circle.managers.map((m) => (
                      <li key={m.user_id}>
                        {/* A co-manager sees themselves in the list — say so, not their own name. */}
                        {m.user_id === user?.id ? "You" : m.display_name} — co-manager
                      </li>
                    ))}
                    {circle.followers.map((f) => (
                      <li key={f.id}>
                        {f.display_name} — follows ({f.share_level === "severe_only" ? "severe allergens only" : "full profile"})
                      </li>
                    ))}
                  </ul>
                )}
                {waiting > 0 && (
                  <>
                    <h3>Invites waiting to be accepted</h3>
                    <PendingInvites
                      profileId={profile.id}
                      circle={circle}
                      isOwner={profile.relationship === "owner"}
                      viewerId={user?.id}
                      onChanged={() => reloadCircle(profile.id)}
                    />
                  </>
                )}
              </>
            )}
            <p>
              <Link to={`/profiles/${profile.id}#circle`}>Invite people or manage {whose} circle</Link>
            </p>
          </section>
        );
      })}

      {followed.length > 0 && (
        <section aria-labelledby="circles-youre-in">
          <h2 id="circles-youre-in">Circles you're in</h2>
          <ul className="card-list">
            {followed.map((p) => (
              <li key={p.id}>
                <Link to={`/profiles/${p.id}`} className="card">
                  <span className="card__title">{p.label}</span>{" "}
                  <span className="card__meta">
                    — you follow ({p.share_level === "severe_only" ? "severe allergens only" : "full profile"})
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {circleRequestsEnabled && <AskToFollow />}
    </main>
  );
}
