import { env } from "../env.js";

/** "found": Open Food Facts has the product. "not_found": it answered that it doesn't. "failed": no
 *  answer either way — a timeout, network error, 5xx or unreadable reply. Principle 2: a failed
 *  lookup is never told to anyone as "not on file" (BACKLOG.md, "A failed product lookup…"). */
export type LookupStatus = "found" | "not_found" | "failed";

export type ProductLookup = {
  status: LookupStatus;
  found: boolean;
  name: string | null;
  brand: string | null;
  ingredientsText: string | null;
  allergensTags: string[];
  tracesTags: string[];
  lastUpdated: Date | null;
  raw: unknown;
};

const NOT_FOUND: ProductLookup = {
  status: "not_found",
  found: false,
  name: null,
  brand: null,
  ingredientsText: null,
  allergensTags: [],
  tracesTags: [],
  lastUpdated: null,
  raw: null,
};

const FAILED: ProductLookup = { ...NOT_FOUND, status: "failed" };

const FETCH_TIMEOUT_MS = 8000;

/** Strips a language prefix ("en:"), lowercases, hyphens to spaces — docs/legacy-spec.md §3. */
function normalizeTag(tag: string): string {
  return tag
    .replace(/^[a-z]{2}:/i, "")
    .toLowerCase()
    .replace(/-/g, " ");
}

type OffResponse = {
  status?: number;
  product?: {
    product_name?: string;
    brands?: string;
    ingredients_text?: string;
    allergens_tags?: string[];
    traces_tags?: string[];
    last_modified_t?: number;
  };
};

/**
 * Fails closed on anything at all, and never throws: an exception here must not be able to skip the
 * verdict computation downstream, and nothing here is ever allowed to look like "safe." Either
 * failure is found: false, so the verdict is Unable to confirm exactly as before. What differs is
 * `status`, so nobody is told a barcode isn't on file when nobody found out:
 * - "not_found" only when Open Food Facts says so: `status: 0` in the body. An unknown barcode comes
 *   back as HTTP 404 with that JSON body (checked 2026-10-08, BACKLOG.md), so a 404 is read, not
 *   treated as a failure — or every scan of an unknown barcode would call Open Food Facts again.
 * - "failed" for a timeout, network error, 5xx or any other non-2xx, unreadable JSON, a 404 without
 *   that body, or a 200 that isn't a product.
 */
export async function fetchProduct(barcode: string): Promise<ProductLookup> {
  try {
    const url = new URL(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}.json`);
    url.searchParams.set(
      "fields",
      "product_name,brands,ingredients_text,allergens_tags,traces_tags,last_modified_t",
    );

    const res = await fetch(url, {
      headers: { "User-Agent": env.offUserAgent },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok && res.status !== 404) return FAILED;

    const data = (await res.json()) as OffResponse | null;
    if (data?.status === 0) return NOT_FOUND;
    if (!res.ok || data?.status !== 1 || !data.product) return FAILED;

    const p = data.product;
    return {
      status: "found",
      found: true,
      name: p.product_name?.trim() || null,
      brand: p.brands?.trim() || null,
      ingredientsText: p.ingredients_text?.trim() || null,
      allergensTags: (p.allergens_tags ?? []).map(normalizeTag),
      tracesTags: (p.traces_tags ?? []).map(normalizeTag),
      lastUpdated: p.last_modified_t ? new Date(p.last_modified_t * 1000) : null,
      raw: data,
    };
  } catch {
    return FAILED;
  }
}
