import { env } from "../env.js";

export type ProductLookup = {
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
  found: false,
  name: null,
  brand: null,
  ingredientsText: null,
  allergensTags: [],
  tracesTags: [],
  lastUpdated: null,
  raw: null,
};

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
 * Fails closed on anything at all — network error, timeout, non-2xx, malformed JSON, or a
 * genuine "not found" from Open Food Facts all collapse to the same NOT_FOUND result. Never
 * throws: an exception here must not be able to skip the verdict computation downstream, and
 * nothing here is ever allowed to look like "safe."
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
    if (!res.ok) return NOT_FOUND;

    const data = (await res.json()) as OffResponse;
    if (data.status !== 1 || !data.product) return NOT_FOUND;

    const p = data.product;
    return {
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
    return NOT_FOUND;
  }
}
