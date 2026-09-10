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
};

function rowToLookup(row: ProductRow): ProductLookup {
  return {
    found: row.found,
    name: row.name,
    brand: row.brand,
    ingredientsText: row.ingredients_text,
    allergensTags: row.allergens_tags,
    tracesTags: row.traces_tags,
    lastUpdated: row.product_last_updated,
    raw: row.raw_data,
  };
}

/** Cache-aware product lookup: consults `products` before ever calling Open Food Facts. */
export async function getProduct(barcode: string): Promise<ProductLookup> {
  const { rows } = await pool.query<ProductRow>("SELECT * FROM products WHERE barcode = $1", [barcode]);
  const cached = rows[0];

  if (cached && Date.now() - cached.fetched_at.getTime() < CACHE_TTL_MS) {
    return rowToLookup(cached);
  }

  const fresh = await fetchProduct(barcode);
  await pool.query(
    `INSERT INTO products
       (barcode, found, name, brand, ingredients_text, allergens_tags, traces_tags, raw_data, product_last_updated, fetched_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, now())
     ON CONFLICT (barcode) DO UPDATE SET
       found = EXCLUDED.found,
       name = EXCLUDED.name,
       brand = EXCLUDED.brand,
       ingredients_text = EXCLUDED.ingredients_text,
       allergens_tags = EXCLUDED.allergens_tags,
       traces_tags = EXCLUDED.traces_tags,
       raw_data = EXCLUDED.raw_data,
       product_last_updated = EXCLUDED.product_last_updated,
       fetched_at = now()`,
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
    ],
  );

  return fresh;
}
