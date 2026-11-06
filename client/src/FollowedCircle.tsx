import { useState } from "react";

import { CircleDiagram } from "./CircleDiagram";
import { leaveCircle, type ProfileSummary } from "./lib/api";
import { CONFIRM_LEAVE, leaveLabel, leaveLine, WHAT_YOU_CAN_SEE, whatYouCanSee, whoCanSee } from "./lib/circleRedesign";

/**
 * A circle you follow (JT's mockup, 2026-11-06, behind CIRCLE_REDESIGN): the profile and you, never
 * anyone else — not their names, not how many (the Oct 27 precedent). Nothing here asks the server
 * for the circle; GET /profiles/:id/circle 404s a follower anyway, so no other member's name ever
 * reaches this browser. What you can see, and Leave, after a second tap.
 */
export function FollowedCircle({ profile, onLeft }: { profile: ProfileSummary; onLeft: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const see = whatYouCanSee(profile);

  async function leave() {
    setLeaving(true);
    setError(null);
    try {
      await leaveCircle(profile.id);
      onLeft();
    } catch {
      setError("Couldn't leave the circle. Try again.");
      setLeaving(false);
    }
  }

  return (
    // Named by the page's h1, "<name>'s circle" (routes/CircleRedesign.tsx).
    <section aria-labelledby="circle-heading">
      <CircleDiagram centerName={profile.label} bubbles={[{ key: "you", name: "You", kind: "you" }]} />
      <p>{whoCanSee(profile)}</p>

      <section className="circle-panel" aria-labelledby="what-you-can-see">
        <h3 id="what-you-can-see">{WHAT_YOU_CAN_SEE}</h3>
        <p>
          <strong>{see.level}</strong>
        </p>
        {see.note && <p>{see.note}</p>}
      </section>

      {error && <p role="alert">{error}</p>}
      {!confirming ? (
        <p>
          <button type="button" className="button-danger" onClick={() => setConfirming(true)}>
            {leaveLabel(profile)}
          </button>
        </p>
      ) : (
        <p className="share-actions">
          <button type="button" className="button-danger button-primary" disabled={leaving} onClick={() => void leave()}>
            {CONFIRM_LEAVE}
          </button>
          <button type="button" onClick={() => setConfirming(false)}>
            Stay
          </button>
        </p>
      )}
      <p className="member-row__note">{leaveLine(profile)}</p>
    </section>
  );
}
