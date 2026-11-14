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
  // The front photo, small (a list row) and full (an item's page): Open Food Facts' own image URLs,
  // kept only when they are https on an openfoodfacts.org host (offImageUrl). Null when it has none.
  imageSmallUrl: string | null;
  imageUrl: string | null;
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
  imageSmallUrl: null,
  imageUrl: null,
  raw: null,
};

const FAILED: ProductLookup = { ...NOT_FOUND, status: "failed" };

const FETCH_TIMEOUT_MS = 8000;

/**
 * An image URL as Open Food Facts gives it, or null: https only, on openfoodfacts.org or a subdomain
 * (images.openfoodfacts.org today). Anything else — another host, http, not a URL — is dropped, so the
 * page never loads a picture from somewhere a record happened to name.
 */
export function offImageUrl(raw: unknown): string | null {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > 2048) return null;
  try {
    const url = new URL(raw);
    const host = url.hostname.toLowerCase();
    return url.protocol === "https:" && (host === "openfoodfacts.org" || host.endsWith(".openfoodfacts.org")) ? url.toString() : null;
  } catch {
    return null;
  }
}

/** The fields asked of Open Food Facts, for a product read and for the text search alike. */
export const OFF_PRODUCT_FIELDS = "product_name,brands,ingredients_text,allergens_tags,traces_tags,last_modified_t,image_front_small_url,image_front_url";

/** Strips a language prefix ("en:"), lowercases, hyphens to spaces — docs/legacy-spec.md §3. Shared with
 *  snackSearch/offSearch.ts, so a search hit's tags are stored exactly as a product lookup's. */
export function normalizeTag(tag: string): string {
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
    image_front_small_url?: string;
    image_front_url?: string;
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
    url.searchParams.set("fields", OFF_PRODUCT_FIELDS);

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
      imageSmallUrl: offImageUrl(p.image_front_small_url),
      imageUrl: offImageUrl(p.image_front_url),
      raw: data,
    };
  } catch {
    return FAILED;
  }
}
