import { pool } from "../db/pool.js";

/**
 * Which profile a scan belongs to — the lookup every scan-scoped route needs before it can call
 * assertCanReadProfile, since the route only has a scan id, not a profile id, until this resolves
 * it. Shared between corrections.ts and scans.ts rather than each keeping its own copy.
 */
export async function getScanAllergenProfileId(scanId: string): Promise<string | null> {
  const { rows } = await pool.query<{ allergen_profile_id: string }>(
    "SELECT allergen_profile_id FROM scans WHERE id = $1",
    [scanId],
  );
  return rows[0]?.allergen_profile_id ?? null;
}

/** Same lookup, one hop further — for a route addressed by a label_extractions id (the adaptive
 *  scan flow's mismatch-confirmation step) rather than a scan id directly. */
export async function getExtractionAllergenProfileId(extractionId: string): Promise<string | null> {
  const { rows } = await pool.query<{ allergen_profile_id: string }>(
    `SELECT s.allergen_profile_id
     FROM label_extractions le
     JOIN scans s ON s.id = le.scan_id
     WHERE le.id = $1`,
    [extractionId],
  );
  return rows[0]?.allergen_profile_id ?? null;
}
