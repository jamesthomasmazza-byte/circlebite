import { hasUsableData, type ProductForMatching, type ProfileAllergen, type Verdict } from "../matcher/match.js";

/**
 * What the adaptive scan flow decides after the barcode call alone, before any photo is taken.
 * "required" means the client skips straight to the capture form instead of rendering a finished
 * card; "prompted" means the barcode card renders in full, with an offer alongside it; "none" means
 * the barcode scan is the whole answer.
 */
export type EvidenceDecision =
  | { photo: "required"; reason: "missing_data" | "thin_data" }
  | { photo: "prompted"; reason: "severe_allergen" | "missing_data" | "thin_data" }
  | { photo: "none" };

/**
 * Barcode always runs first (cheap, deterministic, and the product identity the whole
 * community-correction layer is keyed on) — this decides whether the label photo is the next
 * mandatory step, an offered second opinion, or unnecessary. Deliberately pure and DB-free, same
 * shape as matcher/match.ts and mergeVerdict.ts, so the rule lives in exactly one place rather than
 * being re-derived client-side.
 *
 * Order matters: "required" is checked before "prompted" on purpose. A thin record with a severe
 * allergen on the profile is still required, not merely prompted — data quality, not severity, is
 * what's missing there.
 *
 * The "prompted" branch skips the offer when the barcode alone already came back
 * contains_allergen: a second opinion doesn't change what the family does once the answer is
 * already "don't buy it." This is a deliberate narrowing agreed during planning (2026-09-27), not
 * an oversight — without it, rule 3 fires on every single scan for the app's core user (a family
 * managing a severe allergy), including scans that are already unambiguous.
 *
 * `effectiveVerdict` is what the card headlines — the community-escalated verdict when a
 * corroborated shopper report applied, the engine's otherwise. Never the engine's alone: a barcode
 * no database knows, that other parents reported contains peanut, once decided "required" off the
 * engine's unable_to_confirm and hid the warning behind the capture form (judge seed, 2026-10-05).
 * A Contains verdict on missing or thin data is therefore "prompted", not "required": the warning
 * renders, and the photo is still offered — the barcode checked nothing, so a label is the only
 * evidence for the profile's other allergens. That's also why it differs from the severe-allergen
 * branch below, where the record has already checked them.
 */
export function decideEvidenceNeeded(
  product: ProductForMatching,
  allergens: ProfileAllergen[],
  effectiveVerdict: Verdict,
): EvidenceDecision {
  const photo = effectiveVerdict === "contains_allergen" ? "prompted" : "required";

  if (!hasUsableData(product)) {
    return { photo, reason: "missing_data" };
  }

  // hasUsableData is true here, so at least one of tags/ingredientsText is present — zero tags of
  // either kind therefore means this is exactly today's isPathB shape (scans.ts): free ingredient
  // text only, no structured allergen data at all.
  const isThinRecord = product.allergensTags.length === 0 && product.tracesTags.length === 0;
  if (isThinRecord) {
    return { photo, reason: "thin_data" };
  }

  const hasSevereAllergen = allergens.some((a) => a.severity === "severe");
  if (hasSevereAllergen && effectiveVerdict !== "contains_allergen") {
    return { photo: "prompted", reason: "severe_allergen" };
  }

  return { photo: "none" };
}
