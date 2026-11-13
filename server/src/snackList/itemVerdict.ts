import {
  allergenFoldKey,
  computeVerdict,
  hasUsableData,
  type AllergenVerdictDetail,
  type ProductForMatching,
  type ProfileAllergen,
  type Verdict,
} from "../matcher/match.js";

/**
 * A snack list item's verdict (docs/snack-list-plan.md decision 4), with no AI call.
 *
 * The matcher runs now, on the current product row and the profile's allergens as they are now, so
 * an allergen added since the item was approved flags it, and a product row refreshed with corrected
 * data clears a matcher hit that is no longer there (JT, Nov 13: matcher results always come from the
 * current row). The one thing a product row does not hold is what the model concluded on Path B — a
 * product with ingredient text and no structured tags, where the model reasons over the text the
 * matcher didn't catch (docs/verdict-engine.md). That lives in the scan the item was added from, so
 * its stored per-allergen detail is carried as a floor, and only its AI side:
 *
 * - An allergen the model escalated (aiEscalated, or left unresolved) stays escalated here, with its
 *   cited span, however the matcher reads the row now. The model can only ever add caution
 *   (verdict-engine rule 2), so carrying it can only add caution.
 * - A matcher hit stored on the scan is NOT carried: it is recomputed from the current row above.
 *
 * Where the model's answer is missing, the item fails closed (rule 1): on a text-only product, an
 * allergen the matcher clears is "unchecked" — never "clear" — when the originating scan has no
 * detail for it (added to the profile since, or the scan is gone), or when the row's ingredient text
 * is no longer the text the model read. One unchecked allergen makes the item "Unable to confirm".
 * A product with structured tags needs no model and no floor: the matcher's answer is the scan's.
 */

export type SnackItemClassification = "contains" | "caution" | "clear" | "unresolved" | "unchecked";

export type SnackItemAllergenDetail = Omit<AllergenVerdictDetail, "classification"> & {
  classification: SnackItemClassification;
  /** True when the classification came from the originating scan's model finding, not the matcher. */
  aiEscalated: boolean;
  citedSpan?: string;
  reason?: string;
};

/** What the route reads back from scans.matched_allergens and scans.ingredients_text. */
export type OriginatingScan = {
  matchedAllergens: StoredScanDetail[];
  ingredientsText: string | null;
};

export type StoredScanDetail = {
  allergenName: string;
  classification: string;
  aiEscalated?: boolean;
  citedSpan?: string;
  reason?: string;
  [key: string]: unknown;
};

function isTextOnly(product: ProductForMatching): boolean {
  return product.found && Boolean(product.ingredientsText) && product.allergensTags.length === 0 && product.tracesTags.length === 0;
}

/** The model's own non-clearances on the scan: an escalation, or a term it could not resolve. */
function modelFloor(stored: StoredScanDetail | undefined): SnackItemClassification | null {
  if (!stored) return null;
  if (stored.aiEscalated && (stored.classification === "contains" || stored.classification === "caution")) {
    return stored.classification;
  }
  if (stored.classification === "unresolved" || stored.classification === "unchecked") return stored.classification;
  return null;
}

export function computeItemVerdict(
  allergens: ProfileAllergen[],
  product: ProductForMatching,
  originatingScan: OriginatingScan | null,
): { verdict: Verdict; matchedAllergens: SnackItemAllergenDetail[] } {
  if (!hasUsableData(product)) return { verdict: "unable_to_confirm", matchedAllergens: [] };

  const current = computeVerdict(allergens, product);
  const textOnly = isTextOnly(product);
  const storedByKey = new Map<string, StoredScanDetail>();
  for (const d of originatingScan?.matchedAllergens ?? []) {
    if (typeof d?.allergenName === "string") storedByKey.set(allergenFoldKey(d.allergenName), d);
  }
  // The model read the scan's text. If the row's text is different now, its answer is about other
  // words, and the matcher alone can't say the new text is clear.
  const modelReadThisText =
    originatingScan !== null && (originatingScan.ingredientsText ?? null) === (product.ingredientsText ?? null);

  const matchedAllergens: SnackItemAllergenDetail[] = current.matchedAllergens.map((detail) => {
    if (detail.classification !== "clear") return { ...detail, aiEscalated: false };

    const stored = storedByKey.get(allergenFoldKey(detail.allergenName));
    const floor = modelFloor(stored);
    if (floor) {
      return {
        ...detail,
        classification: floor,
        aiEscalated: true,
        ...(typeof stored?.citedSpan === "string" ? { citedSpan: stored.citedSpan } : {}),
        ...(typeof stored?.reason === "string" ? { reason: stored.reason } : {}),
      };
    }
    if (textOnly && (!stored || !modelReadThisText)) {
      return { ...detail, classification: "unchecked", aiEscalated: false };
    }
    return { ...detail, aiEscalated: false };
  });

  const verdict: Verdict = matchedAllergens.some((d) => d.classification === "contains")
    ? "contains_allergen"
    : matchedAllergens.some((d) => d.classification === "caution")
      ? "may_contain_caution"
      : matchedAllergens.some((d) => d.classification === "unresolved" || d.classification === "unchecked")
        ? "unable_to_confirm"
        : "safe";

  return { verdict, matchedAllergens };
}
