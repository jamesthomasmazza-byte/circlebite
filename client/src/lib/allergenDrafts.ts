import { EMPTY_PICK, type AllergenPick } from "../AllergenPicker";
import { OTHER_ALLERGEN_KEY, type AllergenChoice, type Severity } from "./api";

// The add-profile form's allergen rows (routes/Profiles.tsx). Each row has its own id, so removing
// one can't move another row's choices onto it (2026-10-26). Severity starts unset: a parent
// chooses it (lib/severityCopy.ts).

export type AllergenDraft = { id: number; pick: AllergenPick; severity: Severity | null; treatTracesAsUnsafe: boolean };

let nextId = 0;

export function emptyDraft(): AllergenDraft {
  return { id: nextId++, pick: EMPTY_PICK, severity: null, treatTracesAsUnsafe: true };
}

/** "Remove Peanut", or "Remove this allergen" before one is chosen. */
export function removeLabel(pick: AllergenPick, choices: AllergenChoice[] | null): string {
  const name =
    pick.key === OTHER_ALLERGEN_KEY ? pick.otherName.trim() : choices?.find((c) => c.key === pick.key)?.displayName;
  return `Remove ${name || "this allergen"}`;
}

/** Shown on every row once there are two, and on a lone row once something is chosen in it. */
export function canRemove(draft: AllergenDraft, rowCount: number): boolean {
  return rowCount > 1 || draft.pick.key !== "" || draft.severity !== null;
}

/** The rows without that one. Removing the last row leaves one empty row, never none. */
export function removeDraft(drafts: AllergenDraft[], id: number): AllergenDraft[] {
  const rest = drafts.filter((d) => d.id !== id);
  return rest.length > 0 ? rest : [emptyDraft()];
}
