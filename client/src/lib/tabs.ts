import type { ProfileSummary, UnseenProfileChanges } from "./api";

// The bottom tab bar (TabShell.tsx, 2026-10-23): Profile · Scan · Circle. Plain values, under test.

/** Where a signed-in person lands — after sign-in, at "/", and at the old "/dashboard". */
export const LANDING_PATH = "/scan";

export type Tab = "profile" | "scan" | "circle";

export const TAB_LABEL: Record<Tab, string> = { profile: "Profile", scan: "Scan", circle: "Circle" };

export const TAB_PATH: Record<Tab, string> = { profile: "/profiles", scan: LANDING_PATH, circle: "/circle" };

/** Which tab a signed-in page belongs to. Everything that isn't Scan or Circle is the person's own
 *  stuff — profiles, their scan history, settings, and the admin pages. */
export function activeTab(pathname: string): Tab {
  if (pathname === "/scan" || pathname.startsWith("/scan/")) return "scan";
  if (pathname === "/circle" || pathname.startsWith("/circle/")) return "circle";
  return "profile";
}

/**
 * The Profile tab's badge: unacknowledged changes someone else made to a profile you own (Prof.
 * Yoest's Condition 2 — never learned of by accident), plus allergens a manager needs to look at
 * (migration 0046). The same two things the banner on Scan names.
 */
export function profileBadgeCount(
  unseen: Pick<UnseenProfileChanges, "count">[],
  managed: Pick<ProfileSummary, "allergens_needing_review">[],
): number {
  return (
    unseen.reduce((n, u) => n + u.count, 0) + managed.reduce((n, p) => n + (p.allergens_needing_review ?? 0), 0)
  );
}

/** What a screen reader hears on the badge. */
export function badgeLabel(count: number): string {
  return count === 1 ? "1 update to review" : `${count} updates to review`;
}

/**
 * Where the Condition 2 banner and the "needs a look" notice show in full: Scan, where a signed-in
 * person lands, and the Profile tab's own page. Everywhere else the Profile tab's badge carries them.
 */
export function noticesShownOn(pathname: string): boolean {
  return pathname === LANDING_PATH || pathname === TAB_PATH.profile;
}
