import { env } from "../env.js";
import { matchAllergen, type ProfileAllergen, type Verdict } from "../matcher/match.js";
import type { EffectiveScanResult, MatchedAllergenLike, ScanForCorrection } from "./applyCorrections.js";
import { loadCommunityAdditions } from "./communityAdditions.js";

/**
 * One corroborated add_caution claim about a barcode, aggregated across every reporter who made
 * it. `allergen` is the name as the reporter's own profile spelled it ("Peanuts", "Tree nuts") —
 * not necessarily the spelling on the profile being scanned now, which is why matching goes
 * through allergensOverlap() below rather than string equality.
 */
export type CommunityAddition = {
  allergen: string;
  correctionIds: string[];
  reporterCount: number;
};

/** What was actually applied, per allergen on the scanned profile — stored on the scan row. */
export type AppliedCommunityAddition = {
  allergenName: string;
  reportedAs: string[];
  correctionIds: string[];
  reporterCount: number;
};

export type CommunityEffectiveResult = EffectiveScanResult & { applied: AppliedCommunityAddition[] };

function asIngredientText(text: string) {
  return { found: true, allergensTags: [], tracesTags: [], ingredientsText: text };
}

/**
 * Whether a report about allergen `a` on one profile is a report about allergen `b` on another.
 * Profile allergen names are free text, so "Peanuts" and "peanut" must match, and so must the
 * synonym clusters the deterministic matcher already knows ("Milk" / "Dairy").
 *
 * Runs the matcher in both directions, treating each name as a one-word ingredient list for the
 * other. That gets the tree-nut umbrella right in both directions without a special case: a report
 * of "Walnut" reaches a "Tree Nuts" profile (walnut is one of its keywords), and a report of "Tree
 * Nuts" reaches a "Walnut" profile (the report didn't say which nut — docs/principles.md principle
 * 1, false caution beats false safety). It also inherits the matcher's word boundaries, so "Fish"
 * never reaches "Shellfish" and "Peanut" never reaches "Tree Nuts".
 */
export function allergensOverlap(a: string, b: string): boolean {
  if (a.trim().toLowerCase() === b.trim().toLowerCase()) return true;
  return matchAllergen(a, asIngredientText(b)).matched || matchAllergen(b, asIngredientText(a)).matched;
}

/**
 * Week 8 part 2: corroborated community corrections reach profiles other than the reporter's.
 *
 * Additions only, by JT's decision on 2026-09-10. A corroborated add_caution (two families, per
 * recordCorrection.ts's CORROBORATION_THRESHOLD — one report until 2026-10-07) escalates the
 * matching allergen on this profile to "contains". A corroborated remove_caution (threshold 3) is
 * deliberately NOT read here — it still changes only
 * the reporter's own view (applyUserCorrections). Signup is open to any adult, so three throwaway
 * accounts could otherwise clear a peanut warning for every family in the app; removals wait for a
 * review queue. See the precedent row in docs/principles.md.
 *
 * Escalate-only by construction: the function never sets anything but "contains" and never
 * touches an allergen that no addition matches, so it cannot move any verdict toward safe.
 *
 * "contains", not "caution": a community report of unknown provenance resolves to a direct
 * ingredient, not a trace (docs/legacy-spec.md §6). An allergen the scan already had as "contains"
 * is left alone — the label data is the stronger source, and the card shouldn't claim the change
 * came from shoppers when it didn't.
 *
 * Severity comes from the scanned profile's own allergen, not the reporter's — it's this person's
 * severity that decides what a severe_only follower is shown.
 *
 * Returns null when nothing applied, so the caller can tell "no change" from "changed" and never
 * render a transparency note for a no-op.
 */
export function applyCommunityCorrections(
  scan: ScanForCorrection,
  profileAllergens: Pick<ProfileAllergen, "name" | "severity">[],
  additions: CommunityAddition[],
): CommunityEffectiveResult | null {
  if (additions.length === 0) return null;

  const matchedAllergens: MatchedAllergenLike[] = scan.matchedAllergens.map((m) => ({ ...m }));
  const applied: AppliedCommunityAddition[] = [];

  for (const profileAllergen of profileAllergens) {
    const relevant = additions.filter((a) => allergensOverlap(a.allergen, profileAllergen.name));
    if (relevant.length === 0) continue;

    const key = profileAllergen.name.toLowerCase();
    const existing = matchedAllergens.find((m) => m.allergenName.toLowerCase() === key);
    if (existing?.classification === "contains") continue;

    // Max, not sum: the same person can have reported "Peanut" and "Peanuts" from two different
    // profiles, and a sum would count them twice. The card says "at least this many".
    const reporterCount = Math.max(...relevant.map((a) => a.reporterCount));
    const marker = { communityReported: true, communityReporterCount: reporterCount };

    if (existing) {
      existing.classification = "contains";
      Object.assign(existing, marker);
    } else {
      // No entry to escalate — the product wasn't found, had no data, or this allergen was added
      // to the profile after the scan. Same shape the matcher produces, so the card renders it.
      matchedAllergens.push({
        allergenName: profileAllergen.name,
        matched: false,
        source: null,
        severity: profileAllergen.severity,
        classification: "contains",
        ...marker,
      });
    }

    applied.push({
      allergenName: profileAllergen.name,
      reportedAs: relevant.map((a) => a.allergen),
      correctionIds: relevant.flatMap((a) => a.correctionIds),
      reporterCount,
    });
  }

  if (applied.length === 0) return null;

  // A scan with no per-allergen entries at all checked nothing — the product wasn't found, or had no
  // data. The report names one allergen; the rest must still be named, as "unchecked", never left
  // off. Every other card enumerates the profile's allergens, so a card naming one of two implies
  // the other was fine — on the one card where nothing was checked (2026-10-05). Effective view
  // only: the scan row keeps the engine's empty list. `uncheckedBecause` lets the card say why,
  // since "unchecked" otherwise means a photo that didn't show it.
  if (scan.matchedAllergens.length === 0) {
    for (const profileAllergen of profileAllergens) {
      const key = profileAllergen.name.toLowerCase();
      if (matchedAllergens.some((m) => m.allergenName.toLowerCase() === key)) continue;
      matchedAllergens.push({
        allergenName: profileAllergen.name,
        matched: false,
        source: null,
        severity: profileAllergen.severity,
        classification: "unchecked",
        uncheckedBecause: "no_product_data",
      });
    }
  }

  // Every applied entry is "contains", which dominates the rollup — including over a fail-closed
  // unable_to_confirm, the one case where the original result is kept by applyUserCorrections, and
  // over the "unchecked" entries just added (mergeVerdict.ts's rollup puts contains first too).
  return { result: "contains_allergen", matchedAllergens, applied };
}

/**
 * The DB-touching wrapper around applyCommunityCorrections — load this barcode's corroborated
 * additions (if the kill switch is on and there's a real barcode to key the lookup on) and apply
 * them. Shared by every scan-writing path (scans.ts, labelScan.ts, and the adaptive flow's combine
 * step) instead of each re-deriving "is the switch on and is there a barcode" plus the load/apply
 * sequence on its own — three copies of a small block is still a duplication class worth avoiding,
 * same reasoning as match.ts's hasUsableData.
 *
 * communityApplied is null whenever community is null, regardless of *why* (switch off vs. no
 * barcode) — that's the existing, load-bearing meaning of a null community_corrections_applied
 * column: "nothing to say," not "nothing happened."
 */
export async function applyCommunityCorrectionsIfEnabled(
  barcode: string | null,
  verdict: Verdict,
  matchedAllergens: MatchedAllergenLike[],
  profileAllergens: Pick<ProfileAllergen, "name" | "severity">[],
): Promise<{ community: CommunityEffectiveResult | null; communityApplied: AppliedCommunityAddition[] | null }> {
  if (!env.communityCorrections || !barcode) {
    return { community: null, communityApplied: null };
  }
  const additions = (await loadCommunityAdditions([barcode])).get(barcode) ?? [];
  const community = applyCommunityCorrections({ result: verdict, matchedAllergens }, profileAllergens, additions);
  return { community, communityApplied: community?.applied ?? [] };
}
