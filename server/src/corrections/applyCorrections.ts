import type { CorrectionType, Direction } from "./recordCorrection.js";

export type MatchedAllergenLike = {
  allergenName: string;
  severity: string;
  // "unchecked" (docs/verdict-engine.md Path C): a photo-sourced allergen the deterministic pass
  // and AI both found nothing for. Deliberately not "clear" — see rollupResult below.
  classification: "contains" | "caution" | "clear" | "unresolved" | "unchecked";
  // The viewer's own report that this allergen isn't there, and its status — noted on the row, never
  // applied to it (applyUserCorrections). Only ever on the reporter's own view.
  disputedByYou?: "pending" | "corroborated";
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
  // "unchecked" forces the same outcome as "unresolved" — mirrors mergeVerdict.ts's own
  // rollupVerdict fix (docs/principles.md, Sept 26, 2026: the "we can't see everything" override
  // has to apply everywhere that claim is made). Found while reviewing this exact duplicated
  // rollup logic for the same case: a Path C scan with one real "contains" and five "unchecked"
  // allergens, where the user corrects the "contains" one to "clear" — without this, the recompute
  // here would see no "contains", no "unresolved", and fall through to "safe", silently dropping
  // the five allergens that were never actually checked.
  if (matchedAllergens.some((m) => m.classification === "unresolved" || m.classification === "unchecked")) {
    return "unable_to_confirm";
  }
  if (matchedAllergens.some((m) => m.classification === "caution")) return "may_contain_caution";
  return "safe";
}

/**
 * docs/verdict-engine.md principle 6, as amended 2026-10-23: a user's correction changes their own
 * view immediately — but a report that an allergen ISN'T there never lowers what the card says.
 * Computes what the REPORTING user's own view should show, as a value distinct from the original —
 * never mutates or replaces it — so the caller can render both and be transparent about what
 * changed (docs/legacy-spec.md §6: "do not silently change a verdict").
 *
 * Returns null when the user has no corrections on this scan (nothing to override).
 *
 * wrong_product clears everything — the whole product record is for the wrong item, so none of its
 * allergen claims are trustworthy, not just one. If present among this user's corrections, it wins
 * outright regardless of anything else, matching docs/legacy-spec.md §6's "clears everything."
 *
 * flag_missing sets the allergen straight to "contains", never merely "caution" — docs/legacy-spec.md
 * §6: "a community report of unknown provenance resolves to 'direct ingredient,' not 'trace,'" the
 * same asymmetry as docs/principles.md principle 1 (false caution beats false safety).
 *
 * flag_wrong leaves the row's classification alone and marks it `disputedByYou` with the report's
 * status, so the card notes the dispute on the row without changing the claim or the headline
 * (docs/principles.md, Oct 23 2026). Before that, one pending, unconfirmed removal turned the
 * reporter's card green: the weakest evidence making the loudest claim, to the person who may be
 * feeding the child. Same asymmetry as docs/fake-family-risk.md — an unverified report can add
 * caution, never remove it — applied to the reporter's own view. Pending and corroborated alike: no
 * reviewer ever accepts a removal, and three families is the bar fabricated accounts could reach.
 *
 * Corrections are applied in the order reported; if the same user somehow has both directions on the
 * same allergen (no schema constraint prevents it, since it only dedupes within one direction), the
 * most recent one wins — an addition after a removal sets "contains" and lifts the dispute mark.
 *
 * A rejected report is judged by its direction (docs/principles.md principle 1, decided
 * 2026-09-29). A rejected removal (flag_wrong, wrong_product) stops applying: an admin looked at the
 * photo and said no. A rejected addition (flag_missing) keeps applying: the rejection stops it
 * reaching other families (communityAdditions.ts), but it never lifts a warning the reporter
 * attested to from the package in their own hand — that would let someone else's decision move the
 * reporter's view toward safe.
 */
export function applyUserCorrections(
  scan: ScanForCorrection,
  corrections: UserCorrection[],
): EffectiveScanResult | null {
  const applicable = corrections.filter((c) => !(c.status === "rejected" && c.direction === "remove_caution"));
  if (applicable.length === 0) return null;

  if (applicable.some((c) => c.correctionType === "wrong_product")) {
    return { result: "unable_to_confirm", matchedAllergens: [] };
  }

  const matchedAllergens = scan.matchedAllergens.map((m) => ({ ...m }));

  let reclassified = false;
  for (const correction of applicable) {
    if (!correction.allergen) continue;
    const key = correction.allergen.toLowerCase();
    const existing = matchedAllergens.find((m) => m.allergenName.toLowerCase() === key);

    if (correction.direction === "remove_caution") {
      // Noted, never applied. Nothing to note on a row the card never flagged ("clear", "unchecked",
      // or no row at all) — the report UI only offers rows it did.
      if (existing && existing.classification !== "clear" && existing.classification !== "unchecked") {
        existing.disputedByYou = correction.status === "corroborated" ? "corroborated" : "pending";
      }
      continue;
    }

    reclassified = true;
    if (existing) {
      existing.classification = "contains";
      delete existing.disputedByYou;
    } else {
      // Shouldn't happen via the real client (the report UI only offers allergens already on the
      // card), but a server-side function can't assume the caller behaved. severity: "severe" here
      // is deliberate, not arbitrary — docs/principles.md principle 1 (false caution beats false
      // safety): guessing a severity that's too low would hide this from a severe_only follower's
      // filtered view, which is the more dangerous failure direction than mildly over-showing it.
      matchedAllergens.push({ allergenName: correction.allergen, severity: "severe", classification: "contains" });
    }
  }

  // Only removals: the rows carry their dispute marks and the engine's own verdict stands as it was —
  // not a recompute from the rows, which could differ from how the engine reached it.
  if (!reclassified) return { result: scan.result, matchedAllergens };

  // Only additions reclassify, and only ever to "contains", so the rollup can't move toward safe.
  // Computed from the rows rather than assumed, so a future reclassification can't silently skip it.
  // (The fail-closed guard that used to sit here stopped a removal lifting unable_to_confirm to safe;
  // removals no longer reclassify anything — principle 6 as amended 2026-10-23.)
  const result = rollupResult(matchedAllergens);

  return { result, matchedAllergens };
}
