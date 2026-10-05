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

/** One grouped line for every unchecked allergen. When it stands in for the explanation it leads
 *  with the limit, as that sentence did — a parent skimming must hit "Not confirmed" first, and
 *  never the word "safe", even negated (Prof. Yoest's Oct 1 directive). The
 *  "check the physical label" advice is left to the disclaimer that follows on every card. */
export function uncheckedNote(input: {
  names: string[];
  profileLabel: string | null;
  leadsCard: boolean;
  basis?: UncheckedBasis;
}): string {
  const n = input.names.length;
  const whose = input.profileLabel ? `${input.profileLabel}'s` : "your";
  // "1 of your allergens" — the plural is right at every count ("one of several").
  const line = `couldn't check ${n} of ${whose} allergens ${uncheckedWhy(n, input.basis ?? "photo")}: ${input.names.join(", ")}.`;
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

/** What an offered (not required) label photo is for, said before the button. Missing or thin data
 *  is only ever "prompted" when the card already says Contains or caution (scanPlan.ts) —
 *  so the copy points the photo at the allergens the barcode couldn't check, and never reads as
 *  though the warning itself is in doubt. Null for anything that isn't an offer. */
export function photoOfferCopy(decision: EvidenceDecision | null | undefined, profileLabel: string | null): string | null {
  if (decision?.photo !== "prompted") return null;
  if (decision.reason === "severe_allergen") {
    return "This profile has a severe allergen on file. The barcode data looks fine, but a photo of the label gives a second opinion.";
  }
  const whose = profileLabel ? `${profileLabel}'s` : "your";
  return `The product data couldn't check the rest of ${whose} allergens — a photo of the ingredients panel can.`;
}
