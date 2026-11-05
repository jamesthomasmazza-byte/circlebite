import { useState, type FormEvent } from "react";

import { CopyLink } from "./CopyLink";
import {
  createFollowInvite,
  createManagerInvite,
  removeManager,
  revokeFollow,
  type CircleData,
  type ProfileSummary,
  type ShareLevel,
} from "./lib/api";
import { CIRCLE_JUST_YOU } from "./lib/emptyStateCopy";
import {
  CREATE_INVITE_LINK,
  INVITE_CO_MANAGER,
  INVITE_FAILED,
  INVITE_SOMEONE,
  INVITES_WAITING,
  REMOVE_FAILED,
  circleOwnerLine,
} from "./lib/inviteCopy";
import { profilePossessive } from "./lib/profileChangeCopy";
import { PendingInvites } from "./PendingInvites";

/**
 * One managed profile's circle on the Circle tab (2026-11-05, BACKLOG item 10): who's in it, the
 * invites waiting, and making invites — moved here from the profile page. One per card, and the
 * one-time invite link lives in this component's own state, so a link made for Maya can only ever
 * show under Maya's card. Display names only, like the rest of this tab (docs/principles.md, Oct 27).
 *
 * Who may do what is the server's (routes/circle.ts); the buttons follow it: any manager makes and
 * cancels follow invites and revokes followers, only the owner removes a co-manager.
 */
export function CircleManage({
  profile,
  circle,
  viewerId,
  onChanged,
}: {
  profile: Pick<ProfileSummary, "id" | "label" | "is_self" | "relationship">;
  circle: CircleData;
  viewerId: string | undefined;
  onChanged: () => Promise<void>;
}) {
  const isOwner = profile.relationship === "owner";
  const whose = profilePossessive({ label: profile.label, isSelf: profile.is_self });
  const [shareLevel, setShareLevel] = useState<ShareLevel>("all");
  const [message, setMessage] = useState("");
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleFollowInvite(event: FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      const { token } = await createFollowInvite(profile.id, { shareLevel, message: message.trim() || undefined });
      // Shown once — the server never returns the raw token again after this response.
      setInviteLink(`${window.location.origin}/follow/${token}`);
      setMessage("");
      await onChanged();
    } catch {
      setError(INVITE_FAILED);
    }
  }

  async function handleManagerInvite() {
    setError(null);
    try {
      const { token } = await createManagerInvite(profile.id);
      setInviteLink(`${window.location.origin}/co-manager/${token}`);
      await onChanged();
    } catch {
      setError(INVITE_FAILED);
    }
  }

  async function handleRevokeFollow(followId: string) {
    setError(null);
    try {
      await revokeFollow(profile.id, followId);
    } catch {
      setError(REMOVE_FAILED);
    }
    await onChanged();
  }

  async function handleRemoveManager(userId: string) {
    if (!window.confirm("Remove this co-manager's access?")) return;
    setError(null);
    try {
      await removeManager(profile.id, userId);
    } catch {
      setError(REMOVE_FAILED);
    }
    await onChanged();
  }

  const ownerLine = circleOwnerLine(circle, viewerId);
  const waiting = circle.pendingFollows.length + circle.pendingManagerInvites.length;

  return (
    <>
      {error && <p role="alert">{error}</p>}
      {circle.managers.length === 0 && circle.followers.length === 0 ? (
        <p>{CIRCLE_JUST_YOU}</p>
      ) : (
        <ul className="row-list circle-members">
          {/* Someone else's profile that you co-manage: say whose. */}
          {ownerLine && <li>{ownerLine}</li>}
          {circle.managers.map((m) => (
            <li key={m.user_id}>
              {/* A co-manager sees themselves in the list — say so, not their own name. */}
              {m.user_id === viewerId ? "You" : m.display_name} — co-manager{" "}
              {isOwner && m.user_id !== viewerId && (
                <button type="button" onClick={() => void handleRemoveManager(m.user_id)}>
                  Remove<span className="visually-hidden"> {m.display_name}</span>
                </button>
              )}
            </li>
          ))}
          {circle.followers.map((f) => (
            <li key={f.id}>
              {f.display_name} — follows ({f.share_level === "severe_only" ? "severe allergens only" : "full profile"}){" "}
              <button type="button" onClick={() => void handleRevokeFollow(f.id)}>
                Revoke<span className="visually-hidden"> {f.display_name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {waiting > 0 && (
        <>
          <h3>{INVITES_WAITING}</h3>
          <PendingInvites profileId={profile.id} circle={circle} isOwner={isOwner} viewerId={viewerId} onChanged={onChanged} />
        </>
      )}

      <h3>{INVITE_SOMEONE}</h3>
      {inviteLink && <CopyLink url={inviteLink} />}
      <form onSubmit={handleFollowInvite} className="circle-invite">
        <select
          aria-label={`What they can see of ${whose} profile`}
          value={shareLevel}
          onChange={(e) => setShareLevel(e.target.value as ShareLevel)}
        >
          <option value="all">Full profile</option>
          <option value="severe_only">Severe allergens only</option>
        </select>
        <input
          aria-label={`Message with the invite to ${whose} profile (optional)`}
          placeholder="Message (optional)"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
        />
        <button type="submit">{CREATE_INVITE_LINK}</button>
      </form>
      <p>
        <button type="button" onClick={() => void handleManagerInvite()}>
          {INVITE_CO_MANAGER}
        </button>
      </p>
    </>
  );
}
