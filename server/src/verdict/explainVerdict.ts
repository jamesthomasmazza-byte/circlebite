import type { MergeResult } from "./mergeVerdict.js";

function joinList(items: string[]): string {
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

export type ExplainVerdictOptions = {
  /** Which evidence was actually consulted — "photo" when a photographed label was the only
   *  evidence (standalone Path C, or a Path D scan whose barcode had no usable product record),
   *  "combined" for Path D with both a barcode record and a photographed label. Omitted entirely for Path B (barcode only). Only changes the branches below that fire
   *  when nothing escalates, so the reader knows which source(s) actually looked and found nothing;
   *  a real contains/caution/unresolved finding is exactly as real from a photo as from a barcode
   *  (rule 2: escalation only), so those branches are untouched regardless of this option. */
  evidenceSource?: "photo" | "combined";
  /** The AI reasoning step failed or never ran (no key, spend cap, API error, bad response). The
   *  verdict is already fail-closed (mergeVerdict.ts); this only stops the sentence under it reading
   *  like a clean result — or, on a photo, blaming the photo. Which failure it was stays server-side
   *  (verdict_explanations.failure_reason, and the log line in aiFailureLog.ts), never on the card. */
  aiFailed?: boolean;
};

// The AI step failed and nothing on the card is a finding. Under "Unable to confirm", without
// "No listed allergens … were found", which read as a clean result for a week in October 2026 while
// the production key was expired. "anyone", not "you": the profile is usually a child's.
export const CHECK_INCOMPLETE =
  "We couldn't finish checking the ingredients. Check the label yourself before anyone eats this.";

// The AI step failed, but the keyword match still found something, and its rows are on the card.
// Those rows are real; the gap is every allergen the check never got to.
export const CHECK_INCOMPLETE_PARTIAL =
  "We couldn't finish checking the ingredients, so other allergens may not be shown here. Check the label yourself.";

// Path D only: the product record's own check finished clean, then the label photo's check failed.
// The headline is the record's "No listed allergens found" (a label can only escalate, never block),
// so the sentence under it says where that result came from rather than "couldn't finish checking
// the ingredients", which reads as if the headline itself were unchecked.
export const LABEL_CHECK_FAILED_RECORD_ONLY =
  "We couldn't check your photo of the label. The result above is from the product record only — check the label yourself.";

// The photo-reading call itself failed (Paths C and D). Says nothing about the photo, because nothing
// is known about it. No "scan the barcode" either: a barcode with no data is often how the person
// got here, so that advice sends them in a loop.
export const PHOTO_CHECK_FAILED = "Try again in a few minutes. Until then, check the label yourself.";

// The names of which allergens are unchecked live in the client's own grouped block (Scan.tsx),
// which has the profile label and can list them plainly — this headline sentence stays generic on
// purpose so it doesn't duplicate that list, and stays accurate even if a caller never renders the
// grouped block. Leads with the limit, not the reassurance: "Not confirmed" comes first, and never
// the word "safe", even negated (Prof. Yoest's Oct 1 directive — this replaced "This hasn't been
// confirmed safe", docs/principles.md Oct 1 2026 precedent).
const PHOTO_SOURCED_SOME_UNCHECKED =
  "Not confirmed — some of your listed allergens couldn't be checked against " +
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
  "Not confirmed — we only checked the text read from your photo, not the " +
  "manufacturer's own data. None of your listed allergens appeared in it, but always check the " +
  'label yourself, especially for "may contain" warnings.';

// Path D's nothing-found string: names both sources explicitly rather than reusing Path B's single-
// source fallback below, which reads as though only one record was ever checked.
const COMBINED_NOTHING_FOUND =
  "Neither the product record nor the label you photographed listed any allergens from this profile.";

/**
 * Why a barcode scan had nothing to check — the two cases principle 2 says to tell apart, because
 * they mean different things to the person holding the package: we don't know this barcode at all,
 * or we know the product but have no ingredient or allergen data for it. Only called when the
 * product record has no usable data (matcher/match.ts's hasUsableData), which is exactly when
 * computeVerdict fails closed to unable_to_confirm with no rows to explain it.
 */
export function explainMissingProductData(product: { found: boolean }): string {
  return product.found
    ? "We have this product on file, but without its ingredients or allergen information, so there was nothing to check it against."
    : "We don't have this barcode on file, so there was nothing to check it against.";
}

/**
 * A short, plain-language explanation of what the card's rows can't say on their own, or null when
 * they say it all — a fixed template over the already-merged, already-validated result, not a
 * second model call. The exact token behind each finding lives on its row (matchedText, citedSpan). That
 * keeps cost and failure surface down, and makes the text trivially reproducible from the stored
 * findings alone (rule 8), rather than something that has to be regenerated to be checked.
 */
export function explainVerdict(merged: MergeResult, options: ExplainVerdictOptions = {}): string | null {
  // Says something only when it carries what no row on the card does (docs/principles.md, Sept 30
  // 2026). Each row already names its allergen, its claim and its evidence — the quoted matched
  // text or cited span — so a sentence restating them ("Contains Peanut and Tree nut") is a second
  // copy of the rows on a card read in three seconds. What rows can't say: why an allergen couldn't
  // be resolved, why nothing was found, and why nothing could be checked.

  // A failed check outranks everything below: every other sentence here describes what a finished
  // check found, and this one didn't finish. Rows still on the card (a keyword hit, or an unresolved
  // term from a barcode's earlier, successful check on a combined scan) get the partial wording.
  if (options.aiFailed) {
    const shownRows = merged.matchedAllergens.some(
      (a) => a.classification === "contains" || a.classification === "caution" || a.classification === "unresolved",
    );
    if (shownRows) return CHECK_INCOMPLETE_PARTIAL;
    if (options.evidenceSource === "combined" && merged.verdict === "safe") return LABEL_CHECK_FAILED_RECORD_ONLY;
    return CHECK_INCOMPLETE;
  }

  // First, even alongside a positive finding: the row says "couldn't confirm", only this says why.
  const unresolved = merged.matchedAllergens.filter((a) => a.classification === "unresolved");
  if (unresolved.length > 0) {
    const names = unresolved.map((a) => a.allergenName);
    return `Could not confirm ${joinList(names)} from the ingredient text — the wording was too ambiguous to resolve.`;
  }

  // contains, treated-as-unsafe traces, and may-contain traces: the rows say it all. Unchecked
  // allergens alongside them get the card's own grouped note, not this sentence.
  const positive = merged.matchedAllergens.some((a) => a.classification === "contains" || a.classification === "caution");
  if (positive) return null;

  // One string for both photo and combined: "unchecked" only ever comes from a label with nothing
  // behind it. reconcileEvidence keeps the barcode's own classification whenever the barcode side has
  // an entry, so an unchecked allergen means no product record was consulted for it — and a combined
  // scan with no usable record is passed here as "photo" (combineScan.ts). A "product record or the
  // label" version of this sentence could only ever fire when there was no product record.
  const unchecked = merged.matchedAllergens.filter((a) => a.classification === "unchecked");
  if (unchecked.length > 0) return PHOTO_SOURCED_SOME_UNCHECKED;

  if (options.evidenceSource === "photo") return PHOTO_SOURCED_NOTHING_FOUND;
  if (options.evidenceSource === "combined") return COMBINED_NOTHING_FOUND;

  return "No listed allergens from this profile were found in the ingredient text.";
}
