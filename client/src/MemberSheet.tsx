import { useState } from "react";

import { BottomSheet } from "./BottomSheet";
import { removeManager, revokeFollow, type ProfileSummary } from "./lib/api";
import {
  canRemove,
  CONFIRM_REMOVE,
  joinedLine,
  removalLine,
  removeLabel,
  ROLE_LINE,
  WHAT_THEY_CAN_DO,
  whatTheyCanDo,
  type Member,
  type Role,
} from "./lib/circleRedesign";
import { REMOVE_FAILED } from "./lib/inviteCopy";

/**
 * One person in a circle (JT's mockup, 2026-11-06, behind CIRCLE_REDESIGN): their initials and name,
 * when they joined, and what they can do. Remove only where the viewer's role can (any manager
 * removes a follower, only the owner a co-manager), through today's endpoints, after a second tap.
 */
export function MemberSheet({
  member,
  profile,
  viewer,
  onClose,
  onRemoved,
}: {
  member: Member | null;
  profile: Pick<ProfileSummary, "id" | "label" | "is_self">;
  viewer: Role;
  onClose: () => void;
  onRemoved: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function close() {
    setConfirming(false);
    setError(null);
    onClose();
  }

  async function remove() {
    if (!member?.removeId) return;
    setRemoving(true);
    setError(null);
    try {
      await (member.role === "co_manager" ? removeManager : revokeFollow)(profile.id, member.removeId);
      setConfirming(false);
      onRemoved();
    } catch {
      setError(REMOVE_FAILED);
    } finally {
      setRemoving(false);
    }
  }

  const joined = member ? joinedLine(member.joined) : null;

  return (
    <BottomSheet open={member !== null} onClose={close} labelledBy="member-sheet-title">
      {member && (
        <>
          <div className="member-sheet__head">
            <span className={`member-row__badge${member.isYou ? " member-row__badge--you" : ""}`} aria-hidden="true">
              {member.initials}
            </span>
            <span className="member-row__text">
              <h2 id="member-sheet-title">{member.name}</h2>
              {joined && <span className="member-row__role">{joined}</span>}
            </span>
          </div>

          <section className="circle-panel member-sheet__can" aria-labelledby="member-sheet-can">
            <h3 id="member-sheet-can">{WHAT_THEY_CAN_DO}</h3>
            <p>
              <strong>{ROLE_LINE[member.role]}</strong>
            </p>
            <p>{whatTheyCanDo(member.role, profile)}</p>
          </section>

          {canRemove(viewer, member) && (
            <>
              {error && <p role="alert">{error}</p>}
              {!confirming ? (
                <p>
                  <button type="button" className="button-danger" onClick={() => setConfirming(true)}>
                    {removeLabel(profile)}
                  </button>
                </p>
              ) : (
                <p className="share-actions">
                  <button type="button" className="button-danger button-primary" disabled={removing} onClick={() => void remove()}>
                    {CONFIRM_REMOVE}
                  </button>
                  <button type="button" onClick={() => setConfirming(false)}>
                    Keep them
                  </button>
                </p>
              )}
              <p className="member-row__note">{removalLine(member, profile)}</p>
            </>
          )}
        </>
      )}
    </BottomSheet>
  );
}
