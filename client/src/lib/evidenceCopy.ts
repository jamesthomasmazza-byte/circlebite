import type { EvidenceDecision, MatchedAllergen, ScanResult } from "./api";

// Copy for what a verdict card says it checked. One rule for all of it: describe the evidence that
// existed, never which code path ran (BACKLOG.md Week 9 — a card once said "Checked against the
// product database" two lines below "Unknown product").

/** The provenance line, or null for a plain barcode scan (which needs none). A combined scan with no
 *  `evidence` field is treated as label-only: when unsure, claim less. */
export function provenanceLine(scan: Pick<ScanResult, "source" | "evidence">): { heading: string; detail: string | null } | null {
  if (scan.source === "combined" && scan.evidence === "barcode_and_label") {
    return { heading: "Checked against the product database and a photographed label", detail: null };
  }
  if (scan.source === "combined") {
    return {
      heading: "From a photographed label",
      detail: " — no product record was found for this barcode, so this was read by AI, not confirmed against the manufacturer's own data.",
    };
  }
  if (scan.source === "label_photo") {
    return { heading: "From a photographed label", detail: " — read by AI, not confirmed against the manufacturer's own data." };
  }
  return null;
}

/** True when "unchecked" is the whole story — nothing contains, may contain, or couldn't be resolved.
 *  That is exactly when the server's explanation is its generic "some of your allergens couldn't be
 *  checked" sentence (explainVerdict.ts), which the grouped note below says more specifically. */
export function onlyUncheckedGaps(matched: Pick<MatchedAllergen, "classification">[]): boolean {
  return (
    matched.some((m) => m.classification === "unchecked") &&
    !matched.some((m) => m.classification === "contains" || m.classification === "caution" || m.classification === "unresolved")
  );
}

type CardScan = Pick<ScanResult, "explanation" | "ingredient_check_incomplete" | "matched_allergens">;

/** Whether the server's sentence leads the card. Normally it's dropped when it's only the generic
 *  "some allergens couldn't be checked" line, because the grouped note says it more specifically. When
 *  the check didn't finish, the sentence is the one thing that says so, and always shows. */
export function showsExplanation(scan: CardScan, shown: Pick<MatchedAllergen, "classification">[]): boolean {
  if (!scan.explanation) return false;
  if (scan.ingredient_check_incomplete) return true;
  return !(onlyUncheckedGaps(scan.matched_allergens) && shown.some((m) => m.classification === "unchecked"));
}

/** A row the card renders as a finding — the same filter as the card's allergen rows. */
function isShownRow(m: Pick<MatchedAllergen, "classification">): boolean {
  return m.classification !== "clear" && m.classification !== "unchecked";
}

/** When the check didn't finish but a finding is on the card, the "couldn't finish" sentence goes
 *  under the rows, muted: the rows are what to act on, and the sentence is about what's missing
 *  beside them. With no finding on the card it leads, as the only thing the card has to say. */
export function explanationAfterRows(
  scan: Pick<ScanResult, "ingredient_check_incomplete">,
  shown: Pick<MatchedAllergen, "classification">[],
): boolean {
  return Boolean(scan.ingredient_check_incomplete) && shown.some(isShownRow);
}

/** The words before the "Photograph the ingredients label" button, or null for the button alone.
 *  Always a whole sentence: the button is never the end of one, since a screen reader hears its
 *  label as a separate control (BACKLOG.md Week 9, "a sentence ending in a comma before a button").
 *  When the check didn't finish, the missing-data sentence ("The product data couldn't check the
 *  rest of …") goes: the card already says why the check fell short, and a second sentence would
 *  give a different cause and remedy. The button stays either way. */
export function photoOfferLead(
  decision: EvidenceDecision | null | undefined,
  profileLabel: string | null,
  checkIncomplete: boolean | undefined,
): string | null {
  if (decision?.photo === "required") return "We couldn't check this against a photo yet.";
  if (decision?.photo === "prompted" && decision.reason === "severe_allergen") {
    return "This profile has a severe allergen on file. A photo of the ingredients label is an extra check.";
  }
  if (checkIncomplete) return null;
  return photoOfferCopy(decision, profileLabel);
}

/** The grouped "couldn't check … against this photo" note. Left out when the check didn't finish:
 *  it would blame the photo for what was a failed check, beside a sentence that already says so. */
export function showsUncheckedNote(scan: Pick<ScanResult, "ingredient_check_incomplete">): boolean {
  return !scan.ingredient_check_incomplete;
}

/** One grouped line for every unchecked allergen. When it stands in for the explanation it leads
 *  with the limit, as that sentence did — a parent skimming must hit "Not confirmed" first, and
 *  never the word "safe", even negated (Prof. Yoest's Oct 1 directive). The
 *  "check the physical label" advice is left to the disclaimer that follows on every card. */
export function uncheckedNote(input: {
  names: string[];
  profileLabel: string | null;
  leadsCard: boolean;
  basis?: UncheckedBasis;
  /** The card's explanation, shown above, already says why there was nothing to check against
   *  ("We don't have this barcode on file…"). Then this names the allergens and leaves the why to
   *  that one sentence: the no-data card said "no product data" four times (2026-10-28 audit). Only
   *  for "no_product_data" — a photo's limit is said nowhere else on the card. */
  whySaidAbove?: boolean;
}): string {
  const n = input.names.length;
  const whose = input.profileLabel ? `${input.profileLabel}'s` : "your";
  const basis = input.basis ?? "photo";
  const why = basis === "no_product_data" && input.whySaidAbove ? "" : ` ${uncheckedWhy(n, basis)}`;
  // "1 of your allergens" — the plural is right at every count ("one of several").
  const line = `couldn't check ${n} of ${whose} allergens${why}: ${input.names.join(", ")}.`;
  return input.leadsCard ? `Not confirmed — we ${line}` : `We ${line}`;
}

/** "photo": a photographed label that didn't show the allergen. "no_product_data": nothing to check
 *  it against at all — a barcode with no record, escalated by a shopper report (2026-10-05). */
export type UncheckedBasis = "photo" | "no_product_data";

/** "no_product_data" only when every unchecked allergen carries it; otherwise the photo wording,
 *  which claims less about the product record. */
export function uncheckedBasis(unchecked: Pick<MatchedAllergen, "uncheckedBecause">[]): UncheckedBasis {
  return unchecked.length > 0 && unchecked.every((m) => m.uncheckedBecause === "no_product_data") ? "no_product_data" : "photo";
}

// Says why nothing was found, never that nothing is there — a missing record must not read as a
// clean one.
function uncheckedWhy(n: number, basis: UncheckedBasis): string {
  return basis === "no_product_data"
    ? `— there's no product data on file to check ${n === 1 ? "it" : "them"} against`
    : "against this photo";
}

/** Scan history's version: no profile label on that page, and it carries its own "check the
 *  package" line, since history has no per-card disclaimer to defer to. */
export function historyUncheckedNote(names: string[], basis: UncheckedBasis): string {
  const n = names.length;
  const allergens = `${n} allergen${n === 1 ? "" : "s"}`;
  return basis === "no_product_data"
    ? `Couldn't check ${allergens} ${uncheckedWhy(n, basis)}: ${names.join(", ")}. Always check the package.`
    : `Couldn't check ${allergens} against this photo: ${names.join(", ")}. A photo isn't checked as thoroughly as a barcode — always check the package.`;
}

/** What an offered (not required) label photo is for, said before the button. Missing data says only
 *  what the photo can do: the card's explanation already says there's no product data, and saying it
 *  again here was one of four times on one card (2026-10-28 audit). Missing or thin data
 *  is only ever "prompted" when the card already says Contains or caution (scanPlan.ts) —
 *  so the copy points the photo at the allergens the barcode couldn't check, and never reads as
 *  though the warning itself is in doubt. Null for anything that isn't an offer. */
export function photoOfferCopy(decision: EvidenceDecision | null | undefined, profileLabel: string | null): string | null {
  if (decision?.photo !== "prompted") return null;
  if (decision.reason === "severe_allergen") {
    return "This profile has a severe allergen on file. The barcode data looks fine, but a photo of the label gives a second opinion.";
  }
  const whose = profileLabel ? `${profileLabel}'s` : "your";
  if (decision.reason === "missing_data") return `A photo of the ingredients panel can check the rest of ${whose} allergens.`;
  return `The product data couldn't check the rest of ${whose} allergens — a photo of the ingredients panel can.`;
}
