import type { CircleData, ShareLevel } from "./api";

// Pending invites on the Circle tab and the profile page (2026-10-26). An invite link is shown
// once, when it's made — the server keeps only a hash — so an old invite offers "New link", which
// cancels it and makes a fresh one at the same share level, instead of copying it again.
// Plain values, under test.

export type PendingInvite = {
  kind: "follow" | "co_manager";
  shareLevel?: ShareLevel;
  sentById: string | null;
  sentByName: string | null;
};

/** "Follow invite you sent (full profile) · not used yet", or the other manager's name. */
export function pendingInviteLine(invite: PendingInvite, viewerId: string | undefined): string {
  const what = invite.kind === "co_manager" ? "Co-manager invite" : "Follow invite";
  const who =
    invite.sentById !== null && invite.sentById === viewerId
      ? " you sent"
      : invite.sentByName
        ? ` ${invite.sentByName} sent`
        : "";
  const level =
    invite.kind === "follow" ? (invite.shareLevel === "severe_only" ? " (severe allergens only)" : " (full profile)") : "";
  return `${what}${who}${level} · not used yet`;
}

export const CANCEL_INVITE = "Cancel";
export const NEW_LINK = "New link";
export const COPY_LINK = "Copy link";
export const COPIED = "Copied";
export const COPY_FAILED = "Couldn't copy it — select the link and copy it by hand.";
export const LINK_SHOWN_ONCE = "Invite link (copy it now — it won't be shown again):";
export const CANCEL_FAILED = "Couldn't cancel that invite. Try again.";
/** "New link" cancels first, so two links are never live for one invite; if making the new one fails, say so. */
export const NEW_LINK_FAILED =
  "The old link is cancelled, but a new one couldn't be made. Make a new invite on the Circle tab.";

// Making invites and removing people, on the Circle tab since 2026-11-05 (CircleManage.tsx).
export const INVITE_SOMEONE = "Invite someone";
export const INVITES_WAITING = "Invites waiting to be accepted";
export const CREATE_INVITE_LINK = "Create invite link";
export const INVITE_CO_MANAGER = "Invite a co-manager";
export const INVITE_FAILED = "Couldn't create the invite. Try again.";
export const REMOVE_FAILED = "Couldn't remove them. Try again.";

/** "Sam — owner" on a circle you co-manage; nothing on your own, where it would only say "You". */
export function circleOwnerLine(circle: Pick<CircleData, "owner">, viewerId: string | undefined): string | null {
  if (!circle.owner || circle.owner.user_id === viewerId) return null;
  return `${circle.owner.display_name} — owner`;
}

/** The profile page's one line to its circle, which lives on the Circle tab. */
export function circleCardHref(profileId: string): string {
  return `/circle#circle-${profileId}`;
}
