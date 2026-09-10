import type { MergeResult } from "./mergeVerdict.js";

function joinList(items: string[]): string {
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

function namesWithSpans(details: { allergenName: string; citedSpan?: string }[]): string[] {
  return details.map((d) => (d.citedSpan ? `${d.allergenName} ("${d.citedSpan}")` : d.allergenName));
}

/**
 * A short, plain-language explanation naming the exact cited token(s) behind the verdict — a
 * fixed template over the already-merged, already-validated result, not a second model call. That
 * keeps cost and failure surface down, and makes the text trivially reproducible from the stored
 * findings alone (rule 8), rather than something that has to be regenerated to be checked.
 */
export function explainVerdict(merged: MergeResult): string {
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

  return "No listed allergens from this profile were found in the ingredient text.";
}
