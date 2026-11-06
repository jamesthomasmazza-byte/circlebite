import { ApiRequestError, type ProfileSummary } from "./api";

// Renaming a profile, in Settings → "Your profiles" (JT, 2026-11-05; moved from the profile page).
// Plain values, under test.

export const PROFILE_NAME_LABEL = "Profile name";
export const RENAME_SAVED = "Saved.";

/**
 * The profiles this user can rename: the ones they own or co-manage, the profile page's canManage.
 * Followers' profiles are never listed (the server would 404 the save anyway).
 */
export function renameableProfiles(list: { managed: ProfileSummary[] }): ProfileSummary[] {
  return list.managed.filter((p) => p.relationship === "owner" || p.relationship === "co_manager");
}

/**
 * What a row says when its save fails. The server trims the name and refuses an empty one
 * (invalid_request); a 404 is a profile that's gone or no longer managed by this user — the server
 * doesn't say which, so neither does this.
 */
export function renameErrorCopy(err: unknown): string {
  if (err instanceof ApiRequestError) {
    if (err.message === "invalid_request") return "Enter a name for this profile.";
    if (err.status === 404) return "That profile no longer exists, or you no longer manage it. Reload this page.";
  }
  return "Couldn't save. Try again.";
}

/**
 * One row's Save: sends the name as typed (the server trims it) and returns the saved name, or the
 * row's error. Never throws, so a failure always lands on the row it came from.
 */
export async function saveRename(
  id: string,
  label: string,
  update: (id: string, input: { label: string }) => Promise<{ label: string }>,
): Promise<{ label: string; error: null } | { label: null; error: string }> {
  try {
    const updated = await update(id, { label });
    return { label: updated.label, error: null };
  } catch (err) {
    return { label: null, error: renameErrorCopy(err) };
  }
}
