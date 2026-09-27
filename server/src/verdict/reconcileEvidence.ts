import type { Verdict } from "../matcher/match.js";
import type { Confidence, MergedAllergenDetail, MergedClassification } from "./mergeVerdict.js";
import { rollupVerdict } from "./mergeVerdict.js";

export type EvidenceSource = "barcode" | "label";
export type Disagreement = "label_stricter" | "label_looser";

/**
 * One allergen's final classification after weighing what the barcode's own data said against what
 * the photographed label independently said. `otherSource` is only ever set alongside
 * `disagreement` — it's the losing side's own finding, kept so the card can show both claims
 * instead of only the one that won.
 */
export type ReconciledAllergenDetail = MergedAllergenDetail & {
  evidenceSource: EvidenceSource;
  disagreement?: Disagreement;
  otherSource?: MergedAllergenDetail;
};

export type ReconciliationResult = {
  verdict: Verdict;
  confidence: Confidence;
  matchedAllergens: ReconciledAllergenDetail[];
};

function isPositive(c: MergedClassification): c is "caution" | "contains" {
  return c === "caution" || c === "contains";
}

function severityRank(c: "caution" | "contains"): number {
  return c === "contains" ? 3 : 2;
}

/**
 * Per-allergen reconciliation of a combined scan's two independent readings.
 *
 * `barcode` is undefined exactly when the barcode side had no usable data at all (matcher/match.ts's
 * hasUsableData was false for the whole product) — there is nothing to reconcile against, so the
 * label's own finding stands as-is. This is the only sub-case where the label is the sole evidence;
 * see mergeVerdict.ts's photoSourced handling for what that already does to a bare "nothing found"
 * (it becomes "unchecked", never "clear" — unchanged by this function, just passed through).
 *
 * When both sides have something to say, this is deliberately NOT a severity-max: a barcode
 * "contains"/"caution" is never downgraded by a label that stayed silent about it (label_looser).
 * That's the same escalate-only invariant classifyAllergen already enforces for a single source,
 * applied across two sources — a photo's silence can't clear an allergen on its own (that's the
 * whole reason "unchecked" exists), so it can't be strong enough to weaken a different source's
 * positive finding either (docs/principles.md, Sept 27 2026 precedent). The one direction that DOES
 * escalate is label_stricter: a label can add a finding the barcode never had, exactly like the AI
 * layer can add a finding the deterministic matcher never had.
 *
 * No new classification value is introduced for either direction — `contains`/`caution`/`clear`/
 * `unresolved`/`unchecked` stay the only five. label_looser keeps the barcode side's classification
 * completely unchanged; only `disagreement` and `otherSource` are new information layered on top,
 * which is what keeps rollupVerdict (unmodified, reused as-is) producing the same outcome a
 * barcode-only scan would have produced for that allergen.
 */
function reconcileOne(barcode: MergedAllergenDetail | undefined, label: MergedAllergenDetail): ReconciledAllergenDetail {
  if (!barcode) {
    return { ...label, evidenceSource: "label" };
  }

  // label.classification is never "clear" — mergeVerdict's photoSourced:true invariant already
  // guarantees that — "unchecked" plays the same structural role "clear" plays on the barcode side:
  // this source looked and found nothing to add.
  const labelIsSilent = label.classification === "unchecked";
  const labelIsUncertain = label.classification === "unresolved";
  const labelIsPositive = isPositive(label.classification);

  if (barcode.classification === "clear") {
    if (labelIsSilent) return { ...barcode, evidenceSource: "barcode" };
    if (labelIsUncertain) return { ...label, evidenceSource: "label" };
    // labelIsPositive — the label found something the barcode's own data never had.
    return { ...label, evidenceSource: "label", disagreement: "label_stricter", otherSource: barcode };
  }

  if (barcode.classification === "unresolved") {
    // The barcode side's own ambiguity (rare — Path B's AI raising a term it couldn't resolve).
    // A positive label finding resolves it; silence or the label's own uncertainty leaves it as is.
    if (labelIsPositive) return { ...label, evidenceSource: "label" };
    return { ...barcode, evidenceSource: "barcode" };
  }

  // barcode.classification is "contains" or "caution" — a real, decided positive finding.
  if (labelIsSilent) {
    return { ...barcode, evidenceSource: "barcode", disagreement: "label_looser", otherSource: label };
  }
  if (labelIsUncertain) {
    // The label's own ambiguity doesn't compete with an already-decided barcode finding — it
    // neither confirms nor contradicts it, so the barcode's classification simply stands.
    return { ...barcode, evidenceSource: "barcode" };
  }
  // Both sides made a positive claim. Escalate only if the label's claim is the more severe one —
  // a label agreeing at the same or a lesser severity than an already-decided barcode finding isn't
  // a disagreement, it's corroboration.
  if (severityRank(label.classification as "caution" | "contains") > severityRank(barcode.classification as "caution" | "contains")) {
    return { ...label, evidenceSource: "label", disagreement: "label_stricter", otherSource: barcode };
  }
  return { ...barcode, evidenceSource: "barcode" };
}

/**
 * Reconciles a combined scan's barcode-side merge (already persisted on the scan row from the
 * original barcode call — never recomputed here, so the barcode side's own AI call is never paid
 * for twice) against a freshly computed label-side merge (mergeVerdict run over the extracted label
 * text with photoSourced:true, exactly as today's standalone Path C already does).
 *
 * Iterates over `labelSide`, not `barcodeSide`: labelSide is always fully populated — one entry per
 * profile allergen — whenever this function is reached at all (it's only ever called after a
 * legible, complete extraction), while barcodeSide is either fully populated too (thin or good
 * barcode data) or empty (missing data entirely, computeVerdict's own fail-closed shape). Iterating
 * the side that's guaranteed complete is what makes the missing-barcode case fall out for free
 * rather than needing its own branch here.
 */
export function reconcileEvidence(barcodeSide: MergedAllergenDetail[], labelSide: MergedAllergenDetail[]): ReconciliationResult {
  const barcodeByName = new Map(barcodeSide.map((d) => [d.allergenName.toLowerCase(), d]));
  const matchedAllergens = labelSide.map((label) => reconcileOne(barcodeByName.get(label.allergenName.toLowerCase()), label));

  const verdict = rollupVerdict(matchedAllergens);
  // Same rule as mergeVerdict's own: a combined scan always has label evidence in the mix, and
  // label evidence is OCR-sourced (the confidence-bands table's "low" band), so "high" never
  // applies here even when the barcode side alone was Path A structured tags.
  const confidence: Confidence = verdict === "unable_to_confirm" ? "low" : "medium";

  return { verdict, confidence, matchedAllergens };
}
