import { pool } from "../db/pool.js";
import { fetchProduct, type ProductLookup } from "./openFoodFacts.js";

// Performance cache only — distinct from verdict-engine.md's ~12-month staleness signal for
// prompting a label photo (weeks 6-7). This just avoids hitting Open Food Facts on every repeat
// scan of the same barcode.
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

type ProductRow = {
  found: boolean;
  name: string | null;
  brand: string | null;
  ingredients_text: string | null;
  allergens_tags: string[];
  traces_tags: string[];
  raw_data: unknown;
  product_last_updated: Date | null;
  fetched_at: Date;
  image_front_small_url: string | null;
  image_front_url: string | null;
};

function rowToLookup(row: ProductRow): ProductLookup {
  return {
    status: row.found ? "found" : "not_found",
    found: row.found,
    name: row.name,
    brand: row.brand,
    ingredientsText: row.ingredients_text,
    allergensTags: row.allergens_tags,
    tracesTags: row.traces_tags,
    lastUpdated: row.product_last_updated,
    imageSmallUrl: row.image_front_small_url,
    imageUrl: row.image_front_url,
    raw: row.raw_data,
  };
}

/**
 * A row the judge seed wrote (server/src/db/seedJudge.ts), marked in raw_data. Its barcode is a
 * GTIN with a deliberately invalid check digit, so Open Food Facts can never have it: refreshing it
 * after the TTL would replace the seeded product with "not found" mid-week, and a judge rescanning
 * a barcode from their history would get "Unable to confirm" where history says something else. A
 * seeded row is the product record for that barcode, so it is never refreshed. Real rows never
 * carry the marker — only the seed writes it.
 */
export const SEED_PRODUCT_MARKER = "circlebite_seed";

function isSeedProduct(row: ProductRow): boolean {
  const raw = row.raw_data as Record<string, unknown> | null;
  return raw !== null && typeof raw === "object" && raw[SEED_PRODUCT_MARKER] === true;
}

// Product photos arrived with migration 0052 (Nov 14): a row written before it has no image fields,
// however fresh. Such a row — found, not seeded, no image, fetched before the migration was applied —
// counts as stale, so the next scan refreshes it (JT, Nov 14; the one-off db/backfillProductImages.ts
// does the rest). The migration's time is read once per process; before it is known, or if the
// migrations table can't say, nothing is treated as stale on this account.
const IMAGES_MIGRATION = "0052_products_front_images.sql";
let imagesMigrationAppliedAt: Promise<Date | null> | null = null;

function imagesMigrationTime(): Promise<Date | null> {
  imagesMigrationAppliedAt ??= pool
    .query<{ applied_at: Date }>("SELECT applied_at FROM schema_migrations WHERE filename = $1", [IMAGES_MIGRATION])
    .then((r) => r.rows[0]?.applied_at ?? null)
    .catch(() => null);
  return imagesMigrationAppliedAt;
}

/** For tests: forget the cached migration time. */
export function resetImagesMigrationTime(): void {
  imagesMigrationAppliedAt = null;
}

async function predatesImages(row: ProductRow): Promise<boolean> {
  if (!row.found || row.image_front_small_url || row.image_front_url) return false;
  const appliedAt = await imagesMigrationTime();
  return appliedAt !== null && row.fetched_at.getTime() < appliedAt.getTime();
}

/** Cache-aware product lookup: consults `products` before ever calling Open Food Facts. */
export async function getProduct(barcode: string): Promise<ProductLookup> {
  const { rows } = await pool.query<ProductRow>("SELECT * FROM products WHERE barcode = $1", [barcode]);
  const cached = rows[0];

  if (cached && (isSeedProduct(cached) || (Date.now() - cached.fetched_at.getTime() < CACHE_TTL_MS && !(await predatesImages(cached))))) {
    return rowToLookup(cached);
  }

  const fresh = await fetchProduct(barcode);
  // A failed lookup is never cached: written as a row it would read as "not on file" for a day, and
  // overwrite a real product's data once that row passed its TTL. A stale row that found the product
  // beats no data at all, so it's served instead. A stale not-found isn't: its answer is as old as
  // the row, and one written before failures were told apart may itself have been a failure — so
  // the failure is said as what it is.
  if (fresh.status === "failed") {
    return cached?.found ? rowToLookup(cached) : fresh;
  }
  await pool.query(
    `INSERT INTO products
       (barcode, found, name, brand, ingredients_text, allergens_tags, traces_tags, raw_data, product_last_updated, fetched_at,
        image_front_small_url, image_front_url)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, now(), $10, $11)
     ON CONFLICT (barcode) DO UPDATE SET
       found = EXCLUDED.found,
       name = EXCLUDED.name,
       brand = EXCLUDED.brand,
       ingredients_text = EXCLUDED.ingredients_text,
       allergens_tags = EXCLUDED.allergens_tags,
       traces_tags = EXCLUDED.traces_tags,
       raw_data = EXCLUDED.raw_data,
       product_last_updated = EXCLUDED.product_last_updated,
       fetched_at = now(),
       image_front_small_url = EXCLUDED.image_front_small_url,
       image_front_url = EXCLUDED.image_front_url`,
    [
      barcode,
      fresh.found,
      fresh.name,
      fresh.brand,
      fresh.ingredientsText,
      fresh.allergensTags,
      fresh.tracesTags,
      JSON.stringify(fresh.raw),
      fresh.lastUpdated,
      fresh.imageSmallUrl,
      fresh.imageUrl,
    ],
  );

  return fresh;
}
