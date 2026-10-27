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

// Where the box falls in the camera's frame. The preview is object-fit: cover, so the frame is
// scaled until it covers the video element and whatever overflows is cut off equally on both
// sides; the box's place on screen maps back through that.

/** How far beyond the dashed line decoding reaches, on every side, as a share of the box's own
 *  width (left and right) and height (top and bottom). Room for a barcode's blank margins when it
 *  fills the box edge to edge. To tune after phone tests. */
export const REGION_ALLOWANCE = 0.05;

export type Rect = { x: number; y: number; width: number; height: number };

/** The box, plus the allowance, in frame pixels and kept inside the frame. Null if anything has no
 *  size yet (the camera still starting) or the box falls outside the frame. */
export function boxToFrame(
  video: Rect,
  box: Rect,
  frame: { width: number; height: number },
  allowance: number = REGION_ALLOWANCE,
): Rect | null {
  if (video.width <= 0 || video.height <= 0 || frame.width <= 0 || frame.height <= 0) return null;
  if (box.width <= 0 || box.height <= 0) return null;
  const scale = Math.max(video.width / frame.width, video.height / frame.height);
  // Where the frame's top-left corner sits on screen: at or above and left of the element's.
  const originX = video.x + (video.width - frame.width * scale) / 2;
  const originY = video.y + (video.height - frame.height * scale) / 2;
  const padX = box.width * allowance;
  const padY = box.height * allowance;
  const left = Math.max(0, Math.floor((box.x - padX - originX) / scale));
  const top = Math.max(0, Math.floor((box.y - padY - originY) / scale));
  const right = Math.min(frame.width, Math.ceil((box.x + box.width + padX - originX) / scale));
  const bottom = Math.min(frame.height, Math.ceil((box.y + box.height + padY - originY) / scale));
  if (right <= left || bottom <= top) return null;
  return { x: left, y: top, width: right - left, height: bottom - top };
}
