import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { getCircle, listProfiles, type CircleData, type ProfileSummary } from "../lib/api";
import { useAuth } from "../lib/AuthContext";
import { profilePossessive } from "../lib/profileChangeCopy";

type ManagedCircle = { profile: ProfileSummary; circle: CircleData | null };

/**
 * The Circle tab (2026-10-23): for each profile you manage, who's in its circle and which invites
 * nobody has accepted yet; then the profiles you follow. Read-only — making invites and removing
 * people stay on the profile page, one link away. There are no requests to approve: an invite is a
 * link the invitee accepts (an approve/decline flow is in BACKLOG, after judging).
 */
export function Circle() {
  const { user } = useAuth();
  const [managed, setManaged] = useState<ManagedCircle[] | null>(null);
  const [followed, setFollowed] = useState<ProfileSummary[]>([]);
  const [loadError, setLoadError] = useState(false);

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
      {managed.length === 0 && followed.length === 0 && (
        <p>
          You're not in any circle yet. <Link to="/profiles">Add a profile</Link> to invite people to it.
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
                  <p>Just you, so far.</p>
                ) : (
                  <ul>
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
                    <ul>
                      {circle.pendingManagerInvites.map((m) => (
                        <li key={m.id}>Co-manager invite</li>
                      ))}
                      {circle.pendingFollows.map((f) => (
                        <li key={f.id}>
                          Follow invite ({f.share_level === "severe_only" ? "severe allergens only" : "full profile"})
                        </li>
                      ))}
                    </ul>
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
          <ul>
            {followed.map((p) => (
              <li key={p.id}>
                <Link to={`/profiles/${p.id}`}>{p.label}</Link> — you follow (
                {p.share_level === "severe_only" ? "severe allergens only" : "full profile"})
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
