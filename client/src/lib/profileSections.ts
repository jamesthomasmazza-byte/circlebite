// The Profile tab's three sections (2026-10-26, BACKLOG "Plan to judging" item 3): one shows at a
// time, picked by the URL fragment, so the path stays /profiles and TabShell's notices and badge —
// which go by the path alone (lib/tabs.ts noticesShownOn) — are the same on all three.

export type ProfileSection = "profiles" | "account" | "admin";

export const SECTION_LABEL: Record<ProfileSection, string> = { profiles: "Profiles", account: "Account", admin: "Admin" };

/** Where a "Create one" link lands: Profiles, with the add-profile form open. */
export const ADD_PROFILE_PATH = "/profiles#add-profile";

/** The sections you can see. Admin only for an admin; the server's /admin routes 404 for anyone else. */
export function visibleSections(isAdmin: boolean): ProfileSection[] {
  return isAdmin ? ["profiles", "account", "admin"] : ["profiles", "account"];
}

/** `#account` and `#admin` pick those; anything else, or #admin for a non-admin, is Profiles. */
export function profileSection(hash: string, isAdmin: boolean): ProfileSection {
  if (hash === "#account") return "account";
  if (hash === "#admin" && isAdmin) return "admin";
  return "profiles";
}

export function sectionHref(section: ProfileSection): string {
  return section === "profiles" ? "/profiles" : `/profiles#${section}`;
}

export function addFormRequested(hash: string): boolean {
  return hash === "#add-profile";
}
