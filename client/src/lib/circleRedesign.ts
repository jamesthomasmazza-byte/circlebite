import type { CircleData, ProfileSummary, ShareLevel } from "./api";
import { profilePossessive } from "./profileChangeCopy";

// The redesigned Circle tab (JT's mockup, 2026-11-06, behind CIRCLE_REDESIGN): who's in a circle,
// the invites waiting, and what each person can do. Plain values, under test. Every sentence here is
// one the code makes true (checked against server routes/circle.ts, Nov 6):
//  - an invite link works once, for whoever accepts it first, and never expires;
//  - removing someone ends their access on their next request;
//  - a follower can leave (POST /profiles/:id/leave), a co-manager can't yet;
//  - a follower's join date is when they accepted, a co-manager's when they were added.
// Members are named by display name only and never get a pronoun: the app doesn't store one.

export type Role = "owner" | "co_manager" | "follower";
export type MemberRole = "owner" | "co_manager" | "follower_all" | "follower_severe";

type Profile = Pick<ProfileSummary, "id" | "label" | "is_self">;
const whose = (p: Profile) => profilePossessive({ label: p.label, isSelf: p.is_self });

/** "Maya", "Leo", "Sam · you're in": one pill per profile you manage or follow. */
export function pillLabel(p: Pick<ProfileSummary, "label">, followed: boolean): string {
  return followed ? `${p.label} · you're in` : p.label;
}

/** Up to two initials, for the diagram and the list. Never a photo (principle 5, N23). */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  const letters = words.length === 1 ? [...words[0]!].slice(0, 1) : [[...words[0]!][0], [...words.at(-1)!][0]];
  return letters.join("").toUpperCase();
}

/** The plain-language role on each row. */
export const ROLE_LINE: Record<MemberRole, string> = {
  owner: "Owns the profile",
  co_manager: "Can edit the profile",
  follower_all: "Sees all allergens",
  follower_severe: "Sees severe allergens only",
};

export function followerRole(level: ShareLevel): MemberRole {
  return level === "severe_only" ? "follower_severe" : "follower_all";
}

/** The member sheet's "What they can do": one sentence, true per the server's checks. */
export function whatTheyCanDo(role: MemberRole, profile: Profile): string {
  const w = whose(profile);
  switch (role) {
    case "owner":
      return `They own ${w} profile. Only they can delete it or remove a co-manager.`;
    case "co_manager":
      return `They can edit ${w} allergens and invite people to the circle.`;
    case "follower_all":
      return `They can see all of ${w} allergens and scan food for ${profile.is_self ? "you" : profile.label}.`;
    case "follower_severe":
      return `They can see ${w} severe allergens only. Their scans still check every allergen on ${w} profile.`;
  }
}

export type Member = {
  key: string;
  // The id the server's remove routes take: a follow's id, a co-manager's user id; null for the owner.
  removeId: string | null;
  name: string;
  // From their display name, yours too: the list says "You" once, in the name, not twice.
  initials: string;
  isYou: boolean;
  role: MemberRole;
  joined: string | null;
};

/**
 * Everyone in a circle, as its owner or a co-manager sees it: the owner first, then co-managers,
 * then followers, in the order they joined. You're "You". The owner has no join date: they made
 * the profile.
 */
export function members(circle: CircleData, viewerId: string | undefined): Member[] {
  const out: Member[] = [];
  if (circle.owner) {
    const isYou = circle.owner.user_id === viewerId;
    const name = circle.owner.display_name;
    out.push({ key: `owner-${circle.owner.user_id}`, removeId: null, name: isYou ? "You" : name, initials: initials(name), isYou, role: "owner", joined: null });
  }
  for (const m of circle.managers) {
    const isYou = m.user_id === viewerId;
    out.push({
      key: `manager-${m.user_id}`,
      removeId: m.user_id,
      name: isYou ? "You" : m.display_name,
      initials: initials(m.display_name),
      isYou,
      role: "co_manager",
      joined: m.added_at,
    });
  }
  for (const f of circle.followers) {
    out.push({
      key: `follow-${f.id}`,
      removeId: f.id,
      name: f.display_name,
      initials: initials(f.display_name),
      isYou: false,
      role: followerRole(f.share_level),
      joined: f.responded_at,
    });
  }
  return out;
}

/**
 * Whether the viewer can remove this person (server routes/circle.ts): any manager removes a
 * follower; only the owner removes a co-manager; nobody removes the owner or themselves here.
 */
export function canRemove(viewer: Role, member: Pick<Member, "role" | "isYou">): boolean {
  if (member.isYou || member.role === "owner") return false;
  if (member.role === "co_manager") return viewer === "owner";
  return viewer === "owner" || viewer === "co_manager";
}

export type Pending = {
  key: string;
  id: string;
  kind: "follow" | "co_manager";
  shareLevel?: ShareLevel;
  message: string | null;
  role: MemberRole;
};

/** Invites nobody has accepted yet, co-manager invites first, each oldest first. */
export function pendingInvites(circle: CircleData): Pending[] {
  return [
    ...circle.pendingManagerInvites.map((m): Pending => ({ key: `mi-${m.id}`, id: m.id, kind: "co_manager", message: null, role: "co_manager" })),
    ...circle.pendingFollows.map((f): Pending => ({
      key: `fi-${f.id}`,
      id: f.id,
      kind: "follow",
      shareLevel: f.share_level,
      message: f.message,
      role: followerRole(f.share_level),
    })),
  ];
}

/** The pending row. The app never sends the invite itself, so it never says "sent". */
export const PENDING_LINE = "Invite link · waiting for someone to accept";

/** Cancel and New link: any manager on a follow invite, only the owner on a co-manager invite. */
export function canActOnInvite(viewer: Role, kind: Pending["kind"]): boolean {
  return kind === "follow" ? viewer === "owner" || viewer === "co_manager" : viewer === "owner";
}

export const NEW_LINK_NOTE = "The old link stops working.";

// ---- Add to circle (the bottom sheet) ----

export type AddChoice = "all" | "severe_only" | "co_manager";

/** Three choices and no default, as with severity (Oct 25): the parent picks one. */
export const ADD_CHOICES: { value: AddChoice; title: string; hint: string }[] = [
  { value: "all", title: "See all allergens", hint: "Grandparents, family, a regular sitter" },
  { value: "severe_only", title: "See severe allergens only", hint: "A coach or a friend's parent" },
  { value: "co_manager", title: "Help manage the profile", hint: "A co-parent. They can edit allergens and invite people." },
];

export function addTitle(profile: Profile): string {
  return `Add to ${whose(profile)} circle`;
}
export const ADD_SUBTITLE = "What should they be able to do?";
export const ADD_BUTTON_PREFIX = "+ ";

/** The message to share with the link. "them": the app stores no pronoun for a profile. */
export function shareMessage(profile: Profile, link: string): string {
  return profile.is_self
    ? `Join my circle on CircleBite so you can check food for me when I'm with you: ${link}`
    : `Join ${profile.label}'s circle on CircleBite so you can check food for them when they're with you: ${link}`;
}

export const SHARE_INVITE = "Share invite";
export const LINK_FOOTNOTE = "Anyone with this link can join, once. It stops working after the first person accepts. You can cancel it until then.";

/** A co-manager invite's link goes to /co-manager/, a follow invite's to /follow/. */
export function inviteUrl(origin: string, choice: AddChoice, token: string): string {
  return `${origin}/${choice === "co_manager" ? "co-manager" : "follow"}/${token}`;
}

// ---- A member (the bottom sheet) ----

export const WHAT_THEY_CAN_DO = "What they can do";

export function joinedLine(joined: string | null): string | null {
  if (!joined) return null;
  return `Joined ${new Date(joined).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`;
}

export function removeLabel(profile: Profile): string {
  return `Remove from ${whose(profile)} circle`;
}

export function removalLine(member: Pick<Member, "name">, profile: Profile): string {
  return `${member.name} loses access to ${whose(profile)} profile straight away.`;
}

export const CONFIRM_REMOVE = "Yes, remove";

// ---- A follower's view of a circle they're in ----

export function whoCanSee(profile: Pick<ProfileSummary, "label">): string {
  return `Only the people who manage ${profile.label}'s profile can see who else is in this circle.`;
}

export const WHAT_YOU_CAN_SEE = "What you can see";

export function whatYouCanSee(profile: Pick<ProfileSummary, "label" | "share_level">): { level: string; note: string | null } {
  return profile.share_level === "severe_only"
    ? { level: "Severe allergens only", note: `Your scans still check every allergen on ${profile.label}'s profile.` }
    : { level: "All allergens", note: null };
}

export function leaveLabel(profile: Pick<ProfileSummary, "label">): string {
  return `Leave ${profile.label}'s circle`;
}

/** Under Leave: what happens, and the way back (a new invite; checked in server circle.test.ts). */
export function leaveLine(profile: Pick<ProfileSummary, "label">): string {
  return `You'll stop seeing ${profile.label}'s profile straight away. To rejoin, you'll need a new invite.`;
}

export const CONFIRM_LEAVE = "Yes, leave";

// ---- The switcher ----

/**
 * The page's one heading (JT, 2026-11-06): the circle showing, "Maya's circle", or "Your circle" for
 * your own profile; "Circle" only when there's none to show. Followed or managed alike.
 */
export function circleHeading(p: Pick<ProfileSummary, "label" | "is_self"> | undefined): string {
  if (!p) return "Circle";
  return p.is_self ? "Your circle" : `${p.label}'s circle`;
}

/** Pills only when there's a choice to make: two or more circles, managed and followed together. */
export function showCirclePills(count: number): boolean {
  return count >= 2;
}

export const JOIN_SOMEONE_ELSES = "Joining someone else's circle?";

/** Which circle shows first: the one in "Scanning for", or one named by /circle#circle-<id>. */
export function initialCircle(hash: string, scanningForId: string, ids: string[]): string {
  const fromHash = hash.startsWith("#circle-") ? hash.slice("#circle-".length) : "";
  if (fromHash && ids.includes(fromHash)) return fromHash;
  if (ids.includes(scanningForId)) return scanningForId;
  return ids[0] ?? "";
}
