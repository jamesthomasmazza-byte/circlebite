import type { ProfileAccess, UnseenProfileChanges } from "./api";
import { accessNotice } from "./profileLineCopy";

// The redesigned Profile tab and profile page (JT's mockup, 2026-11-06, behind PROFILE_REDESIGN). A
// layout only: what each role can read is unchanged, and every count comes from data that viewer
// already reads — the allergens the profile page sends them, the circle a manager already reads
// (followers get 404 for it), and a scan count from the same rows and check as their history.
// Plain values, under test.

type Relationship = "owner" | "co_manager";

/** A managed profile's tag on the Profile tab. */
export function roleTag(relationship: Relationship | undefined): string {
  return relationship === "owner" ? "You own" : "Co-manager";
}

/** Under the avatar on the profile page: how you hold this profile. */
export function roleLine(access: ProfileAccess): string {
  if (access.level === "owner") return "You own this profile";
  if (access.level === "co_manager") return "You co-manage this profile";
  return access.shareLevel === "severe_only" ? "You follow · severe allergens only" : "You follow";
}

export function allergensStat(n: number): string {
  return n === 1 ? "1 allergen" : `${n} allergens`;
}

export function inCircleStat(n: number): string {
  return `${n} in circle`;
}

export function scansStat(n: number): string {
  return n === 1 ? "1 scan" : `${n} scans`;
}

export type ProfileTab = "allergens" | "scans" | "changes";

/** The tabs this viewer gets: Changes only for the owner and co-managers, whose history it is. */
export function profileTabs(access: ProfileAccess): ProfileTab[] {
  return access.level === "follower" ? ["allergens", "scans"] : ["allergens", "scans", "changes"];
}

/**
 * The tab labels. "Scans" for everyone: the history holds every scan of the profile, not only the
 * viewer's own, so a follower's tab can't say "Your scans".
 */
export const TAB_LABEL: Record<ProfileTab, string> = { allergens: "Allergens", scans: "Scans", changes: "Changes" };

/** The tab a URL hash names (#allergens, #scans, #changes), if this viewer has it; else Allergens. */
export function tabFromHash(hash: string, tabs: ProfileTab[]): ProfileTab {
  const named = hash.replace(/^#/, "") as ProfileTab;
  return tabs.includes(named) ? named : "allergens";
}

/**
 * Above a severe-only follower's list: the profile page's own sentence, then the reason their scans
 * are still safe to rely on — every scan checks the full list (server routes/scans.ts).
 */
export function severeOnlyNotice(access: ProfileAccess, label: string): string | null {
  const first = accessNotice(access);
  return first ? `${first} Your scans still check every allergen on ${label}'s profile.` : null;
}

/** The red count on a profile's avatar: its unacknowledged changes, as the Profile tab's badge counts them. */
export function unseenCountFor(profileId: string, unseen: Pick<UnseenProfileChanges, "profileId" | "count">[]): number {
  return unseen.find((u) => u.profileId === profileId)?.count ?? 0;
}

export function newBadge(k: number): string {
  return `${k} new`;
}

export const MORE_OPTIONS = (label: string) => `More options for ${label}`;
export const ACCOUNT_AND_SETTINGS = "Account and settings";
