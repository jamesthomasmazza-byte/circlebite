// One sentence before the camera is first used on a device (2026-10-27), then the system prompt.
// "Seen" is a per-device convenience in localStorage: if storage is missing or throws, the sentence
// simply shows again — it never stops the camera from starting.

export const CAMERA_PRIMER_KEY = "circlebite.cameraPrimerSeen";

export const CAMERA_PRIMER_HEADING = "Before the camera starts";

export const CAMERA_PRIMER_LINE =
  "CircleBite uses the camera only to read barcodes and ingredient labels, and only while you're scanning.";

type Storage = Pick<globalThis.Storage, "getItem" | "setItem">;

function deviceStorage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export function cameraPrimerSeen(storage: Storage | null = deviceStorage()): boolean {
  try {
    return storage?.getItem(CAMERA_PRIMER_KEY) === "1";
  } catch {
    return false;
  }
}

export function markCameraPrimerSeen(storage: Storage | null = deviceStorage()): void {
  try {
    storage?.setItem(CAMERA_PRIMER_KEY, "1");
  } catch {
    // Shown again next time; nothing else depends on it.
  }
}
