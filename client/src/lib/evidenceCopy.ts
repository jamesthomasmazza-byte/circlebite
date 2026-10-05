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
export function uncheckedNote(input: { names: string[]; profileLabel: string | null; leadsCard: boolean }): string {
  const n = input.names.length;
  const whose = input.profileLabel ? `${input.profileLabel}'s` : "your";
  // "1 of your allergens" — the plural is right at every count ("one of several").
  const line = `couldn't check ${n} of ${whose} allergens against this photo: ${input.names.join(", ")}.`;
  return input.leadsCard ? `Not confirmed — we ${line}` : `We ${line}`;
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
