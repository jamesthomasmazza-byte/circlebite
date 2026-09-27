import { pool } from "../db/pool.js";
import type { ProfileAllergen, Severity } from "./match.js";

/**
 * Shared by every scan-writing path (scans.ts, labelScan.ts, the adaptive flow's combine step) —
 * each had its own copy of this same SELECT-and-map before this extraction, a third copy already
 * fixed this session (applyCommunityCorrectionsIfEnabled) and a fourth was about to start here.
 */
export async function loadProfileAllergens(allergenProfileId: string): Promise<ProfileAllergen[]> {
  const { rows } = await pool.query<{ name: string; severity: Severity; treat_traces_as_unsafe: boolean }>(
    "SELECT name, severity, treat_traces_as_unsafe FROM allergens WHERE allergen_profile_id = $1",
    [allergenProfileId],
  );
  return rows.map((a) => ({ name: a.name, severity: a.severity, treatTracesAsUnsafe: a.treat_traces_as_unsafe }));
}
