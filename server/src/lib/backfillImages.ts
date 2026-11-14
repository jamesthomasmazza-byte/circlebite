import { pool } from "../db/pool.js";
import { fetchProduct } from "./openFoodFacts.js";
import { SEED_PRODUCT_MARKER } from "./productLookup.js";

// The one-off image backfill (JT, Nov 14; run by db/backfillProductImages.ts): product rows saved
// before migration 0052 have no front image. Walk the found, non-seed rows with no image, ask Open Food
// Facts for each again, a pause apart (its limit is 15 product reads a minute per IP; 4 seconds stays
// under it), and save only the two image fields — nothing else about the row changes, so no verdict
// can move. A row Open Food Facts has no image for is left as it is and counted; a failed read is left
// for the next scan (lib/productLookup.ts treats such a row as stale).

export type BackfillCounts = { candidates: number; updated: number; no_image: number; not_found: number; failed: number };

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** `only`: restrict to these barcodes — for tests, which share a database with everything else. */
export async function backfillProductImages(pauseMs: number, options: { only?: string[] } = {}): Promise<BackfillCounts> {
  const { rows } = await pool.query<{ barcode: string }>(
    `SELECT barcode FROM products
     WHERE found
       AND image_front_small_url IS NULL AND image_front_url IS NULL
       AND (raw_data IS NULL OR raw_data->>'${SEED_PRODUCT_MARKER}' IS DISTINCT FROM 'true')
       AND ($1::text[] IS NULL OR barcode = ANY($1))
     ORDER BY fetched_at`,
    [options.only ?? null],
  );
  const counts: BackfillCounts = { candidates: rows.length, updated: 0, no_image: 0, not_found: 0, failed: 0 };

  for (const [i, { barcode }] of rows.entries()) {
    if (i > 0 && pauseMs > 0) await sleep(pauseMs);
    const fresh = await fetchProduct(barcode);
    if (fresh.status === "failed") {
      counts.failed += 1;
      continue;
    }
    if (fresh.status === "not_found") {
      counts.not_found += 1;
      continue;
    }
    if (!fresh.imageSmallUrl && !fresh.imageUrl) {
      counts.no_image += 1;
      continue;
    }
    await pool.query("UPDATE products SET image_front_small_url = $2, image_front_url = $3 WHERE barcode = $1", [
      barcode,
      fresh.imageSmallUrl,
      fresh.imageUrl,
    ]);
    counts.updated += 1;
  }
  return counts;
}
