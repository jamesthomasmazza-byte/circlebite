// The Profile tab's paths. It had three sections, Profiles · Account · Admin, picked by the URL
// fragment (2026-10-26, BACKLOG "Plan to judging" item 3); since 2026-11-06 it lists people only, and
// Account and Admin are on the Account page (JT: two places for account things was confusing).

/** The Account page (routes/Settings.tsx): everything about the account and its settings since
 *  2026-11-06, when the Profile tab became people only. */
export const ACCOUNT_PATH = "/settings";

/** The classic add-profile form: Profiles, with the form open. */
export const ADD_PROFILE_PATH = "/profiles#add-profile";

/** The guided profile setup (routes/NewProfile.tsx, behind GUIDED_SETUP). */
export const NEW_PROFILE_PATH = "/profiles/new";

/** Where "Create one" and "Add a profile" go: the guided setup when it's on, else the classic form. */
export function addProfileHref(guidedSetupEnabled: boolean): string {
  return guidedSetupEnabled ? NEW_PROFILE_PATH : ADD_PROFILE_PATH;
}

/** The Profile tab's old `#account` and `#admin` sections (2026-10-26 to 2026-11-06) both live on the
 *  Account page now, so a bookmark to either lands there. Anything else stays on the Profile tab. */
export function oldSectionRedirect(hash: string): string | null {
  return hash === "#account" || hash === "#admin" ? ACCOUNT_PATH : null;
}

export function addFormRequested(hash: string): boolean {
  return hash === "#add-profile";
}
