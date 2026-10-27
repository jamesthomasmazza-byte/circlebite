// Who is sent to the guided setup on first visit, and "Skip for now" (2026-10-27, GUIDED_SETUP). An
// account with no profiles at all — none owned, none followed — landing on Scan goes to the setup once
// per browser, until it's finished or skipped. A follow-only account (someone who accepted an invite)
// isn't sent. "Skipped" is a per-account convenience in localStorage; if storage is missing or throws,
// nobody is redirected, so nobody can be stuck in a loop.

type Storage = Pick<globalThis.Storage, "getItem" | "setItem">;

function deviceStorage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export function skippedKey(userId: string): string {
  return `circlebite.guidedSetupSkipped.${userId}`;
}

/** True when skipped, and also when it can't be known: unknown means don't redirect. */
export function guidedSetupSkipped(userId: string, storage: Storage | null = deviceStorage()): boolean {
  if (!storage) return true;
  try {
    return storage.getItem(skippedKey(userId)) === "1";
  } catch {
    return true;
  }
}

export function markGuidedSetupSkipped(userId: string, storage: Storage | null = deviceStorage()): void {
  try {
    storage?.setItem(skippedKey(userId), "1");
  } catch {
    // Unknown next time, which means no redirect anyway.
  }
}

export function sendToGuidedSetup(input: {
  enabled: boolean;
  profilesLoaded: boolean;
  ownedOrManaged: number;
  followed: number;
  skipped: boolean;
}): boolean {
  return input.enabled && input.profilesLoaded && input.ownedOrManaged === 0 && input.followed === 0 && !input.skipped;
}

/** How the guided setup was reached: from sign-up, from a first visit, or by choice. */
export function setupArrival(search: string): "signup" | "landing" | null {
  const from = new URLSearchParams(search).get("from");
  return from === "signup" || from === "landing" ? from : null;
}

export const SKIP_FOR_NOW = "Skip for now";
