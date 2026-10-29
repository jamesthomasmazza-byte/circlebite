import type { Pool, PoolClient } from "pg";

import { pool } from "../db/pool.js";
import type { CommunityAddition } from "./applyCommunityCorrections.js";

/**
 * Corroborated add_caution corrections for a set of barcodes, one entry per (barcode, allergen
 * family key) — the key additions corroborate on (migration 0043), so "Sesame", "sesame" and
 * "Sesames" from three reporters are one claim with one count, not three claims of one. `allergen`
 * is one of the spellings used; any of them matches the same profiles, since the key is built from
 * the matcher's own normalisation. A row without a key (written by the previous release during a
 * deploy, before 0044 requires one) is its own group by id, never merged into another allergen's. One query for a whole scan-history page rather than one per row.
 *
 * Only status = 'corroborated' — 'rejected' is the per-report undo (docs/server-setup.md §11) and
 * 'pending' hasn't met the threshold. Only add_caution — removals don't propagate to other
 * profiles (applyCommunityCorrections.ts has the reasoning).
 *
 * count(*), not count(DISTINCT reported_by): reported_by is SET NULL when a reporter deletes their
 * account, and the report stays evidence about the product. The unique index on (barcode,
 * allergen, direction, reported_by) already stops one live account counting twice.
 *
 * Judge worlds (migration 0049): what a profile sees is real-world claims, plus its owner's own
 * judge world's when the owner is a judge or in a judge's circle. A real profile, or no profile,
 * sees real-world claims only — a judge's confirmed warning never reaches a real family. A judge's
 * profile still sees every real warning. Real and own-world reports of one allergen show as one
 * claim on a judge's card; the threshold counted them separately (countCorroboratingFamilies).
 *
 * `db` is for tests that need rows nobody else can see; the app always reads through the pool.
 */
export async function loadCommunityAdditions(
  barcodes: string[],
  profileId: string | null = null,
  db: Pool | PoolClient = pool,
): Promise<Map<string, CommunityAddition[]>> {
  const byBarcode = new Map<string, CommunityAddition[]>();
  if (barcodes.length === 0) return byBarcode;

  const { rows } = await db.query<{ barcode: string } & CommunityAddition>(
    `SELECT barcode,
            min(allergen) AS allergen,
            array_agg(id::text ORDER BY created_at, id) AS "correctionIds",
            count(*)::int AS "reporterCount"
     FROM product_corrections
     WHERE barcode = ANY($1)
       AND direction = 'add_caution'
       AND status = 'corroborated'
       AND allergen IS NOT NULL
       AND (judge_world_at_report IS NULL
            OR judge_world_at_report = (SELECT u.judge_world FROM allergen_profiles p
                                        JOIN users u ON u.id = p.manager_id WHERE p.id = $2))
     GROUP BY barcode, COALESCE(allergen_family_key, 'unkeyed:' || id::text)`,
    [barcodes, profileId],
  );

  for (const { barcode, ...addition } of rows) {
    const existing = byBarcode.get(barcode) ?? [];
    existing.push(addition);
    byBarcode.set(barcode, existing);
  }
  return byBarcode;
}
