import type { Verdict } from "./api";

// Scan sounds (2026-11-05, BACKLOG item 11, behind SCAN_SOUNDS): a neutral beep when the camera
// reads a barcode, an alert for "Contains an allergen", a softer one for "May contain", and nothing
// for "No listed allergens found" or "Unable to confirm". The weaker claim is never the louder one
// (docs/principles.md, Decision precedents, Nov 5). Never the only signal: the card is unchanged.
// Plain values, under test; playing them is scanAudio.ts.

export type VerdictSound = "alert" | "caution";
export type ScanSound = "read" | VerdictSound;

// A Record, so a verdict added later can't compile without someone deciding its sound.
export const VERDICT_SOUND: Record<Verdict, VerdictSound | null> = {
  contains_allergen: "alert",
  may_contain_caution: "caution",
  safe: null,
  unable_to_confirm: null,
};

export type Tone = {
  wave: OscillatorType;
  frequency: number;
  /** Peak gain, 0–1, before the phone's own volume. */
  gain: number;
  pulses: number;
  pulseMs: number;
  gapMs: number;
};

// Generated in code (Web Audio): no files, no external service. The beep is short, high and quiet;
// the alert three loud square pulses; the caution one lower, softer, rounder tone.
export const TONES: Record<ScanSound, Tone> = {
  read: { wave: "sine", frequency: 1320, gain: 0.12, pulses: 1, pulseMs: 60, gapMs: 0 },
  caution: { wave: "triangle", frequency: 440, gain: 0.25, pulses: 1, pulseMs: 260, gapMs: 0 },
  alert: { wave: "square", frequency: 880, gain: 0.5, pulses: 3, pulseMs: 140, gapMs: 90 },
};

const RANK: Record<VerdictSound, number> = { caution: 1, alert: 2 };

/**
 * What to play when a card shows `next`, given what already played for this scan. Only something
 * louder than before: a card that escalates (an AI step, a photo, a report) plays the louder sound
 * then; the same verdict twice, or a card that drops, plays nothing.
 */
export function soundForUpdate(alreadyPlayed: VerdictSound | null, next: Verdict): VerdictSound | null {
  const sound = VERDICT_SOUND[next];
  if (!sound) return null;
  return alreadyPlayed && RANK[alreadyPlayed] >= RANK[sound] ? null : sound;
}

// The per-device setting in Settings (Profile → Account until 2026-11-06). On by default while SCAN_SOUNDS is on; a browser that
// can't read it counts as off (JT, Nov 5).
export const SOUND_PREF_KEY = "circlebite.scanSounds";

type ReadableStorage = Pick<Storage, "getItem">;
type WritableStorage = Pick<Storage, "setItem">;

export function readSoundPref(storage: ReadableStorage | null): boolean {
  if (!storage) return false;
  try {
    const value = storage.getItem(SOUND_PREF_KEY);
    return value === null ? true : value === "on";
  } catch {
    return false;
  }
}

/** False when the browser wouldn't keep it, so the toggle can say so. */
export function writeSoundPref(storage: WritableStorage | null, on: boolean): boolean {
  if (!storage) return false;
  try {
    storage.setItem(SOUND_PREF_KEY, on ? "on" : "off");
    return true;
  } catch {
    return false;
  }
}

/** localStorage, or null where even reaching it throws (some private modes, blocked site data). */
export function browserStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function soundsWanted(switchOn: boolean, storage: ReadableStorage | null): boolean {
  return switchOn && readSoundPref(storage);
}

export const SOUNDS_SETTING = "Scan sounds on this device";
export const SOUNDS_SETTING_LINE = "A sound marks a warning. No sound never means it's fine. Read the card.";
export const SOUNDS_SETTING_UNSAVED = "This browser can't keep the choice, so sounds stay off here.";
