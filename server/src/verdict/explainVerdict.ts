import type { MergeResult } from "./mergeVerdict.js";

function joinList(items: string[]): string {
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

function namesWithSpans(details: { allergenName: string; citedSpan?: string }[]): string[] {
  return details.map((d) => (d.citedSpan ? `${d.allergenName} ("${d.citedSpan}")` : d.allergenName));
}

export type ExplainVerdictOptions = {
  /** Same flag mergeVerdict.ts takes — true for a Path C scan. Only changes the branches below that
   *  fire when nothing escalates; a real contains/caution/unresolved finding is exactly as real
   *  from a photo as from a barcode (rule 2: escalation only), so those branches are untouched. */
  photoSourced?: boolean;
};

// The names of which allergens are unchecked live in the client's own grouped block (Scan.tsx),
// which has the profile label and can list them plainly — this headline sentence stays generic on
// purpose so it doesn't duplicate that list, and stays accurate even if a caller never renders the
// grouped block. Leads with the limit, not the reassurance.
const PHOTO_SOURCED_SOME_UNCHECKED =
  "This hasn't been confirmed safe — some of your listed allergens couldn't be checked against " +
  'this photo. Always check the label yourself, especially for "may contain" warnings.';

// Dead for any real photoSourced scan with at least one allergen configured — mergeVerdict.ts's
// photoSourced branch means "clear" never actually occurs there anymore, so
// PHOTO_SOURCED_SOME_UNCHECKED below always fires first. Kept as a backstop for the degenerate
// case of a profile with zero allergens (same "defense in depth" reasoning as the redundant
// verdict-level override in mergeVerdict.ts), not because it's expected to ever run for a real
// scan. Leads with the limit, not the reassurance — a parent skimming this must hit the caveat
// before the "nothing found" part, not after. Reuses the exact disclaimer phrasing already on
// every verdict card ("always check the physical label, especially for 'may contain' warnings") so
// the two don't read as two different promises.
const PHOTO_SOURCED_NOTHING_FOUND =
  'This hasn\'t been confirmed safe — we only checked the text read from your photo, not the ' +
  "manufacturer's own data. None of your listed allergens appeared in it, but always check the " +
  'label yourself, especially for "may contain" warnings.';

/**
 * A short, plain-language explanation naming the exact cited token(s) behind the verdict — a
 * fixed template over the already-merged, already-validated result, not a second model call. That
 * keeps cost and failure surface down, and makes the text trivially reproducible from the stored
 * findings alone (rule 8), rather than something that has to be regenerated to be checked.
 */
export function explainVerdict(merged: MergeResult, options: ExplainVerdictOptions = {}): string {
  const contains = merged.matchedAllergens.filter((a) => a.classification === "contains");
  if (contains.length > 0) {
    return `Contains ${joinList(namesWithSpans(contains))}.`;
  }

  const unresolved = merged.matchedAllergens.filter((a) => a.classification === "unresolved");
  if (unresolved.length > 0) {
    const names = unresolved.map((a) => a.allergenName);
    return `Could not confirm ${joinList(names)} from the ingredient text — the wording was too ambiguous to resolve.`;
  }

  const caution = merged.matchedAllergens.filter((a) => a.classification === "caution");
  if (caution.length > 0) {
    return `May contain traces of ${joinList(namesWithSpans(caution))}.`;
  }

  const unchecked = merged.matchedAllergens.filter((a) => a.classification === "unchecked");
  if (unchecked.length > 0) return PHOTO_SOURCED_SOME_UNCHECKED;

  if (options.photoSourced) return PHOTO_SOURCED_NOTHING_FOUND;

  return "No listed allergens from this profile were found in the ingredient text.";
}
