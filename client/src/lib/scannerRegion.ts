// Decoding only inside the scanner's target box (2026-10-27, BACKLOG "Plan to judging" item 5),
// behind SCANNER_REGION. Off or unset is the whole-frame decoding that ran before it.
//
// For testing on a real phone before the switch goes on, an admin can override it on one device:
// the choice lives in that browser's localStorage, so it reaches no other phone and no other
// account. For anyone who isn't an admin the server's setting decides, whatever is stored.

export type RegionOverride = "server" | "on" | "off";

export const REGION_OVERRIDE_KEY = "circlebite.scannerRegion";

export const OVERRIDE_CHOICES: { value: RegionOverride; label: string }[] = [
  { value: "server", label: "Server default" },
  { value: "on", label: "On" },
  { value: "off", label: "Off" },
];

/** Anything but "on" or "off" — nothing stored, or something unreadable — is the server's setting. */
export function parseOverride(raw: string | null | undefined): RegionOverride {
  return raw === "on" || raw === "off" ? raw : "server";
}

type Storage = Pick<globalThis.Storage, "getItem" | "setItem" | "removeItem">;

// localStorage can be missing (private mode, blocked site data) or throw on access.
function deviceStorage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export function readOverride(storage: Storage | null = deviceStorage()): RegionOverride {
  try {
    return parseOverride(storage?.getItem(REGION_OVERRIDE_KEY));
  } catch {
    return "server";
  }
}

/** Saves this device's choice; "server" clears it. False when the device can't keep it. */
export function saveOverride(value: RegionOverride, storage: Storage | null = deviceStorage()): boolean {
  if (!storage) return false;
  try {
    if (value === "server") storage.removeItem(REGION_OVERRIDE_KEY);
    else storage.setItem(REGION_OVERRIDE_KEY, value);
    return true;
  } catch {
    return false;
  }
}

/** Whether this device decodes only inside the box. An override counts only for an admin. */
export function scannerRegionOn(serverOn: boolean, isAdmin: boolean, override: RegionOverride): boolean {
  if (isAdmin && override !== "server") return override === "on";
  return serverOn;
}

/** What's in effect and where it comes from, for the Admin section. */
export function regionStatus(serverOn: boolean, isAdmin: boolean, override: RegionOverride): string {
  const where = isAdmin && override !== "server" ? "this device" : "server";
  return `${scannerRegionOn(serverOn, isAdmin, override) ? "Inside the box" : "Whole frame"} (${where})`;
}
