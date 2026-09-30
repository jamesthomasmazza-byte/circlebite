import type { MatchedAllergen, ScanResult } from "./api";

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
 *  with the limit, as that sentence did — a parent skimming must hit "not confirmed safe" first. The
 *  "check the physical label" advice is left to the disclaimer that follows on every card. */
export function uncheckedNote(input: { names: string[]; profileLabel: string | null; leadsCard: boolean }): string {
  const n = input.names.length;
  const whose = input.profileLabel ? `${input.profileLabel}'s` : "your";
  // "1 of your allergens" — the plural is right at every count ("one of several").
  const line = `couldn't check ${n} of ${whose} allergens against this photo: ${input.names.join(", ")}.`;
  return input.leadsCard ? `This hasn't been confirmed safe — we ${line}` : `We ${line}`;
}
