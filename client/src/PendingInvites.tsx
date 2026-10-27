import { useState } from "react";

import { CopyLink } from "./CopyLink";
import {
  cancelFollowInvite,
  cancelManagerInvite,
  createFollowInvite,
  createManagerInvite,
  type CircleData,
} from "./lib/api";
import { CANCEL_FAILED, CANCEL_INVITE, NEW_LINK, NEW_LINK_FAILED, pendingInviteLine } from "./lib/inviteCopy";

/**
 * Invites nobody has accepted yet, with Cancel and New link (2026-10-26) — on the Circle tab and the
 * profile page. A follow invite is any manager's to cancel, as it is to make one; a co-manager invite
 * only the owner's (server routes/circle.ts), so a co-manager sees it without the buttons.
 *
 * New link cancels the old invite first and then makes a new one at the same share level, with the
 * same message, so two links are never live for one invite. The new link shows once, in the new
 * invite's own row.
 */
export function PendingInvites({
  profileId,
  circle,
  isOwner,
  viewerId,
  onChanged,
}: {
  profileId: string;
  circle: CircleData;
  isOwner: boolean;
  viewerId: string | undefined;
  onChanged: () => Promise<void>;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newLink, setNewLink] = useState<{ id: string; url: string } | null>(null);

  async function act(inviteId: string, run: () => Promise<void>) {
    setBusy(inviteId);
    setError(null);
    try {
      await run();
    } finally {
      setBusy(null);
      await onChanged();
    }
  }

  function cancel(kind: "follow" | "co_manager", inviteId: string) {
    return act(inviteId, async () => {
      setNewLink(null);
      try {
        await (kind === "follow" ? cancelFollowInvite : cancelManagerInvite)(profileId, inviteId);
      } catch {
        setError(CANCEL_FAILED);
      }
    });
  }

  function replace(invite: CircleData["pendingFollows"][number] | null, inviteId: string) {
    return act(inviteId, async () => {
      setNewLink(null);
      try {
        await (invite ? cancelFollowInvite : cancelManagerInvite)(profileId, inviteId);
      } catch {
        setError(CANCEL_FAILED);
        return;
      }
      try {
        const made = invite
          ? await createFollowInvite(profileId, { shareLevel: invite.share_level, message: invite.message ?? undefined })
          : await createManagerInvite(profileId);
        setNewLink({ id: made.id, url: `${window.location.origin}/${invite ? "follow" : "co-manager"}/${made.token}` });
      } catch {
        setError(NEW_LINK_FAILED);
      }
    });
  }

  function buttons(inviteId: string, onCancel: () => void, onReplace: () => void) {
    return (
      <span className="pending-invite__actions">
        <button type="button" disabled={busy !== null} onClick={onCancel}>
          {CANCEL_INVITE}
        </button>
        <button type="button" disabled={busy !== null} onClick={onReplace}>
          {NEW_LINK}
        </button>
      </span>
    );
  }

  return (
    <>
      {error && <p role="alert">{error}</p>}
      <ul className="pending-invites row-list">
        {circle.pendingManagerInvites.map((m) => (
          <li key={m.id}>
            {pendingInviteLine({ kind: "co_manager", sentById: m.sent_by_id, sentByName: m.sent_by_name }, viewerId)}
            {isOwner &&
              buttons(
                m.id,
                () => void cancel("co_manager", m.id),
                () => void replace(null, m.id),
              )}
            {newLink?.id === m.id && <CopyLink url={newLink.url} />}
          </li>
        ))}
        {circle.pendingFollows.map((f) => (
          <li key={f.id}>
            {pendingInviteLine(
              { kind: "follow", shareLevel: f.share_level, sentById: f.sent_by_id, sentByName: f.sent_by_name },
              viewerId,
            )}
            {f.message && ` — "${f.message}"`}
            {buttons(
              f.id,
              () => void cancel("follow", f.id),
              () => void replace(f, f.id),
            )}
            {newLink?.id === f.id && <CopyLink url={newLink.url} />}
          </li>
        ))}
      </ul>
    </>
  );
}
