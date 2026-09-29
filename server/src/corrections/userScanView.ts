import { pool } from "../db/pool.js";
import { env } from "../env.js";
import type { Severity } from "../matcher/match.js";
import { applyCommunityCorrections, type AppliedCommunityAddition, type CommunityAddition } from "./applyCommunityCorrections.js";
import { applyUserCorrections, type EffectiveScanResult, type MatchedAllergenLike, type UserCorrection } from "./applyCorrections.js";
import { loadCommunityAdditions } from "./communityAdditions.js";

// What the client gets about community reports: which of this profile's allergens a report
// changed, and how many people made it. Not the correction ids, and not how other people's
// profiles spelled the allergen — that's their data (docs/principles.md principle 5).
export function publicCommunityReports(applied: AppliedCommunityAddition[]) {
  return applied.map(({ allergenName, reporterCount }) => ({ allergenName, reporterCount }));
}

export type ScanForView = {
  id: string;
  barcode: string | null;
  result: string;
  matched_allergens: MatchedAllergenLike[];
};

export type UserScanView = {
  /** This user's own corrections on the scan, oldest first. */
  corrections: UserCorrection[];
  /** Null when neither this user's corrections nor a community report changed anything. */
  effective: EffectiveScanResult | null;
  communityApplied: AppliedCommunityAddition[];
};

/**
 * What one user should see for each of these scans (all on one profile) once corrections are
 * applied — the one place that sequence lives, so scan history and the live card's post-report
 * refresh (routes/corrections.ts) can't drift apart on it.
 *
 * CONTEST_RULES.md §3: a user's own correction overrides the verdict for their view immediately.
 * Only this user's own corrections — never someone else's. Community additions go on top of them,
 * not under: if this user reported an allergen isn't there and the community has corroborated that
 * it is, the warning survives (docs/legacy-spec.md §6).
 *
 * Community additions are read fresh rather than from each scan's community_corrections_applied
 * snapshot: a warning reported after someone bought a product is exactly what they need to see when
 * they look back at it. The snapshot is the audit record of what they were told at the time; this
 * is what's known now. Current profile allergens, not the scan's snapshot, because a not-found scan
 * has no per-allergen snapshot to match against at all.
 *
 * Unfiltered — a severe_only follower's filtering is the caller's decision, since the live card
 * and history deliberately treat it differently.
 */
export async function loadUserScanViews(
  scans: ScanForView[],
  profileId: string,
  userId: string,
): Promise<Map<string, UserScanView>> {
  const views = new Map<string, UserScanView>();
  if (scans.length === 0) return views;

  const { rows: correctionRows } = await pool.query<{ scan_id: string } & UserCorrection>(
    `SELECT id, scan_id, correction_type AS "correctionType", direction, allergen, note, status,
            created_at AS "createdAt"
     FROM product_corrections
     WHERE scan_id = ANY($1) AND reported_by = $2
     ORDER BY created_at ASC`,
    [scans.map((s) => s.id), userId],
  );
  const correctionsByScanId = new Map<string, UserCorrection[]>();
  for (const { scan_id, ...correction } of correctionRows) {
    const existing = correctionsByScanId.get(scan_id) ?? [];
    existing.push(correction);
    correctionsByScanId.set(scan_id, existing);
  }

  let additionsByBarcode = new Map<string, CommunityAddition[]>();
  let profileAllergens: { name: string; severity: Severity }[] = [];
  if (env.communityCorrections) {
    const barcodes = [...new Set(scans.map((s) => s.barcode).filter((b): b is string => b !== null))];
    additionsByBarcode = await loadCommunityAdditions(barcodes);
    ({ rows: profileAllergens } = await pool.query<{ name: string; severity: Severity }>(
      "SELECT name, severity FROM allergens WHERE allergen_profile_id = $1",
      [profileId],
    ));
  }

  for (const scan of scans) {
    const original = { result: scan.result, matchedAllergens: scan.matched_allergens };
    const corrections = correctionsByScanId.get(scan.id) ?? [];
    const userEffective = applyUserCorrections(original, corrections);
    const community = applyCommunityCorrections(
      userEffective ?? original,
      profileAllergens,
      (scan.barcode !== null && additionsByBarcode.get(scan.barcode)) || [],
    );
    views.set(scan.id, {
      corrections,
      effective: community ?? userEffective,
      communityApplied: community?.applied ?? [],
    });
  }
  return views;
}
