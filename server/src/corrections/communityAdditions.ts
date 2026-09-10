import { pool } from "../db/pool.js";
import type { CommunityAddition } from "./applyCommunityCorrections.js";

/**
 * Corroborated add_caution corrections for a set of barcodes, one entry per (barcode, allergen)
 * with the allergen grouped case-insensitively ("Sesame" and "sesame" from two reporters are one
 * claim). One query for a whole scan-history page rather than one per row.
 *
 * Only status = 'corroborated' — 'rejected' is the per-report undo (docs/server-setup.md §11) and
 * 'pending' hasn't met the threshold. Only add_caution — removals don't propagate to other
 * profiles (applyCommunityCorrections.ts has the reasoning).
 *
 * count(*), not count(DISTINCT reported_by): reported_by is SET NULL when a reporter deletes their
 * account, and the report stays evidence about the product. The unique index on (barcode,
 * allergen, direction, reported_by) already stops one live account counting twice.
 */
export async function loadCommunityAdditions(barcodes: string[]): Promise<Map<string, CommunityAddition[]>> {
  const byBarcode = new Map<string, CommunityAddition[]>();
  if (barcodes.length === 0) return byBarcode;

  const { rows } = await pool.query<{ barcode: string } & CommunityAddition>(
    `SELECT barcode,
            min(allergen) AS allergen,
            array_agg(id::text ORDER BY created_at, id) AS "correctionIds",
            count(*)::int AS "reporterCount"
     FROM product_corrections
     WHERE barcode = ANY($1)
       AND direction = 'add_caution'
       AND status = 'corroborated'
       AND allergen IS NOT NULL
     GROUP BY barcode, lower(allergen)`,
    [barcodes],
  );

  for (const { barcode, ...addition } of rows) {
    const existing = byBarcode.get(barcode) ?? [];
    existing.push(addition);
    byBarcode.set(barcode, existing);
  }
  return byBarcode;
}
