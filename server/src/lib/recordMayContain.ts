import type { ProductLookup } from "./openFoodFacts.js";

/**
 * The product record's own "may contain" list, for the redesigned Scan tab's line under the rows
 * (JT, 2026-11-06). Open Food Facts' trace tags as stored, e.g. "en:nuts". Null when there's no
 * record to speak for — a barcode it doesn't have, or a lookup that failed — so the client says
 * nothing about it then; an empty list is a record that lists none. Product data only: nothing here
 * is about the profile, so a severe-only follower's filter has nothing to remove.
 */
export function recordMayContain(product: Pick<ProductLookup, "found" | "tracesTags">): string[] | null {
  return product.found ? [...product.tracesTags] : null;
}
