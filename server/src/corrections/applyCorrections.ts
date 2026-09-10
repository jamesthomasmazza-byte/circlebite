import type { CorrectionType, Direction } from "./recordCorrection.js";

export type MatchedAllergenLike = {
  allergenName: string;
  severity: string;
  classification: "contains" | "caution" | "clear" | "unresolved";
  [key: string]: unknown;
};

export type ScanForCorrection = {
  result: string;
  matchedAllergens: MatchedAllergenLike[];
};

export type UserCorrection = {
  id: string;
  correctionType: CorrectionType;
  direction: Direction;
  allergen: string | null;
  note: string | null;
  status: "pending" | "corroborated" | "rejected";
  createdAt: string;
};

export type EffectiveScanResult = ScanForCorrection;

function rollupResult(matchedAllergens: { classification: string }[]): string {
  if (matchedAllergens.some((m) => m.classification === "contains")) return "contains_allergen";
  if (matchedAllergens.some((m) => m.classification === "unresolved")) return "unable_to_confirm";
  if (matchedAllergens.some((m) => m.classification === "caution")) return "may_contain_caution";
  return "safe";
}

/**
 * CONTEST_RULES.md §3: "A user correction overrides the verdict for that product on their profile
 * immediately." Computes what the REPORTING user's own view should show, as a value distinct from
 * the original — never mutates or replaces it — so the caller can render both and be transparent
 * about what changed (docs/legacy-spec.md §6: "do not silently change a verdict").
 *
 * Returns null when the user has no corrections on this scan (nothing to override).
 *
 * wrong_product clears everything — the whole product record is for the wrong item, so none of its
 * allergen claims are trustworthy, not just one. If present among this user's corrections, it wins
 * outright regardless of anything else, matching docs/legacy-spec.md §6's "clears everything."
 *
 * Otherwise: flag_wrong clears that allergen; flag_missing sets it straight to "contains", never
 * merely "caution" — docs/legacy-spec.md §6: "a community report of unknown provenance resolves to
 * 'direct ingredient,' not 'trace,'" the same asymmetry as docs/principles.md principle 1 (false
 * caution beats false safety). Corrections are applied in the order reported; if the same user
 * somehow has both directions on the same allergen (no schema constraint prevents it, since it only
 * dedupes within one direction), the most recent one wins.
 */
export function applyUserCorrections(
  scan: ScanForCorrection,
  corrections: UserCorrection[],
): EffectiveScanResult | null {
  if (corrections.length === 0) return null;

  if (corrections.some((c) => c.correctionType === "wrong_product")) {
    return { result: "unable_to_confirm", matchedAllergens: [] };
  }

  const matchedAllergens = scan.matchedAllergens.map((m) => ({ ...m }));

  for (const correction of corrections) {
    if (!correction.allergen) continue;
    const key = correction.allergen.toLowerCase();
    const existing = matchedAllergens.find((m) => m.allergenName.toLowerCase() === key);
    const classification = correction.direction === "add_caution" ? "contains" : "clear";

    if (existing) {
      existing.classification = classification;
    } else {
      // Shouldn't happen via the real client (the report UI only offers allergens already on the
      // card), but a server-side function can't assume the caller behaved. severity: "severe" here
      // is deliberate, not arbitrary — docs/principles.md principle 1 (false caution beats false
      // safety): guessing a severity that's too low would hide this from a severe_only follower's
      // filtered view, which is the more dangerous failure direction than mildly over-showing it.
      matchedAllergens.push({ allergenName: correction.allergen, severity: "severe", classification });
    }
  }

  return { result: rollupResult(matchedAllergens), matchedAllergens };
}
