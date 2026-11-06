import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";

import { CircleManage } from "../CircleManage";
import { AskToFollow, FollowRequests } from "../CircleRequests";
import { getCircle, listProfiles, type CircleData, type ProfileSummary } from "../lib/api";
import { useAuth } from "../lib/AuthContext";
import { addProfileHref } from "../lib/profileSections";
import { useScanningFor } from "../TabShell";
import { CircleRedesign } from "./CircleRedesign";

type ManagedCircle = { profile: ProfileSummary; circle: CircleData | null };

/**
 * The Circle tab (2026-10-23): for each profile you manage, who's in its circle and which invites
 * nobody has accepted yet; then the profiles you follow. Invites waiting can be cancelled or given a
 * new link here (2026-10-26, PendingInvites.tsx). Since 2026-11-05 making invites and removing
 * people are here too, one CircleManage per card (BACKLOG item 10); the profile page links to its
 * card (`#circle-<id>`).
 *
 * With CIRCLE_REQUESTS on (2026-10-27): an owner's follow requests come first, to approve or
 * decline (CircleRequests.tsx; the shell holds them, for Scan's notice and this tab's badge), and
 * anyone can ask to follow a parent's profile at the bottom. Invites work exactly as before.
 */
export function Circle() {
  // JT's redesign (2026-11-06) behind CIRCLE_REDESIGN; off, today's tab below, unchanged.
  const { circleRedesignEnabled } = useAuth();
  return circleRedesignEnabled ? <CircleRedesign /> : <CircleClassic />;
}

function CircleClassic() {
  const { user, circleRequestsEnabled, guidedSetupEnabled } = useAuth();
  const { requests, refreshRequests } = useScanningFor();
  const [managed, setManaged] = useState<ManagedCircle[] | null>(null);
  const [followed, setFollowed] = useState<ProfileSummary[]>([]);
  const [loadError, setLoadError] = useState(false);
  const location = useLocation();

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

  // Arriving from a profile page's link (/circle#circle-<id>): the router doesn't scroll to a hash,
  // and the card exists only once the circles have loaded. A jump, not a smooth scroll, for the
  // reason in ProfileDetail.tsx's #changes.
  useEffect(() => {
    if (managed && location.hash.startsWith("#circle-")) {
      document.getElementById(location.hash.slice(1))?.scrollIntoView({ behavior: "instant", block: "start" });
    }
  }, [managed, location.hash]);

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
          You're not in any circle yet. <Link to={addProfileHref(guidedSetupEnabled)}>Add a profile</Link> to invite people to it.
        </p>
      )}

      {managed.map(({ profile, circle }) => (
        <section
          key={profile.id}
          id={`circle-${profile.id}`}
          className="circle-card"
          aria-labelledby={`circle-${profile.id}-heading`}
        >
          <h2 id={`circle-${profile.id}-heading`}>{profile.is_self ? "Your circle" : `${profile.label}'s circle`}</h2>
          {!circle ? (
            <p role="alert">Couldn't load this circle.</p>
          ) : (
            <CircleManage profile={profile} circle={circle} viewerId={user?.id} onChanged={() => reloadCircle(profile.id)} />
          )}
        </section>
      ))}

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
