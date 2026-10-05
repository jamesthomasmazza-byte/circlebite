import { pool } from "../db/pool.js";
import type { ProfileAllergen, Severity } from "./match.js";

/**
 * Shared by every scan-writing path (scans.ts, labelScan.ts, the adaptive flow's combine step) —
 * each had its own copy of this same SELECT-and-map before this extraction, a third copy already
 * fixed this session (applyCommunityCorrectionsIfEnabled) and a fourth was about to start here.
 */
export async function loadProfileAllergens(allergenProfileId: string): Promise<ProfileAllergen[]> {
  const { rows } = await pool.query<{ name: string; severity: Severity; treat_traces_as_unsafe: boolean }>(
    // Ordered, so a scan and its history entry list the same allergens in the same order — both
    // build the card's rows from this list (userScanView.ts). Same order as the profile page.
    "SELECT name, severity, treat_traces_as_unsafe FROM allergens WHERE allergen_profile_id = $1 ORDER BY name",
    [allergenProfileId],
  );
  return rows.map((a) => ({ name: a.name, severity: a.severity, treatTracesAsUnsafe: a.treat_traces_as_unsafe }));
}
