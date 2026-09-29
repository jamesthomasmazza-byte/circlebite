import type { CorrectionType, ScanCorrection } from "./api";

// Plain functions, no JSX — the wording a family or an admin reads about a correction, kept here
// so it can be tested (`npm test -w client`) and shared between pages instead of drifting apart.

/**
 * What the reporter is told right after filing a correction. Says what actually happened, not what
 * the corroboration flag suggests in general: an add_caution (flag_missing) corroborates on its
 * FIRST report — threshold 1, recordCorrection.ts — so "enough other reports agreed" would be false
 * there. Only a remove_caution (threshold 3) needs others to agree, and even corroborated it still
 * only changes the reporter's own view (docs/principles.md, Sept 10 2026 precedent).
 */
export function reportOutcomeMessage(input: {
  correctionType: CorrectionType;
  corroborated: boolean;
  hasBarcode: boolean;
}): string {
  if (input.corroborated) {
    return input.correctionType === "flag_missing"
      ? "Reported — this warning now shows for other families who scan this product."
      : "Reported — enough other reports agreed that this is now corroborated. Removing a warning still only " +
          "changes your own view; other families keep seeing it.";
  }
  if (!input.hasBarcode) {
    return (
      "Reported — thanks. This is recorded against your own view; without a barcode we can't check it " +
      "against anyone else's report of the same product."
    );
  }
  return "Reported — thanks. This is now in the review queue.";
}

const CORRECTION_CLAIM: Record<CorrectionType, string> = {
  flag_wrong: "isn't actually in this product",
  flag_missing: "is in this product, but wasn't flagged",
  wrong_product: "this is the wrong product entirely",
};

const CORRECTION_STATUS: Record<ScanCorrection["status"], string> = {
  corroborated: "corroborated",
  pending: "pending review",
  rejected: "rejected on review",
};

/**
 * One of the viewer's own reports, as listed under a verdict it changed — on the live card straight
 * after reporting and in scan history later, worded the same in both places.
 */
export function yourReportLine(c: Pick<ScanCorrection, "correctionType" | "allergen" | "status" | "note">): string {
  const what = `${c.allergen ? `${c.allergen} ` : ""}${CORRECTION_CLAIM[c.correctionType]}`;
  return `Your report: ${what} — ${CORRECTION_STATUS[c.status]}${c.note ? ` — "${c.note}"` : ""}`;
}
