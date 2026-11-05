// The words on a profile page's compact allergen row (2026-11-05, BACKLOG item 9a). Plain values,
// under test. The traces setting is never worded as "OK": with it off, a "may contain" label still
// shows as a caution on the card, so the row says that (docs/principles.md principle 2; JT, Nov 5).

export function tracesNote(treatTracesAsUnsafe: boolean): string {
  return treatTracesAsUnsafe ? "traces: unsafe" : "traces: caution";
}

/** The checkbox inside a row's details: what it does, in the history's own words. */
export const TRACES_SETTING = "Treat traces as unsafe";
export const TRACES_SETTING_HINT = "Off: a “may contain” label shows as a caution instead.";

export const NOTES_LABEL = "Notes";
export const SAVE_NOTES = "Save notes";
export const REMOVE = "Remove";
export const ROW_SAVE_FAILED = "Couldn't save that. Try again.";
