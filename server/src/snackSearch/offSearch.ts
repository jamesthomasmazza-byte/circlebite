import { env } from "../env.js";
import { normalizeTag } from "../lib/openFoodFacts.js";

// Open Food Facts' text search (docs/snack-list-plan.md addendum, 2026-11-14). The legacy
// /cgi/search.pl is the only full-text search the API offers (its docs, checked Nov 14: "Full-text /
// plain-text search is not available in the v2 server-side API"; the Search-a-licious service answered
// without ingredient text). It returns the same product fields lib/openFoodFacts.ts asks for, so each
// hit can be written to `products` as a full row and the scan a result opens needs no second call.
//
// Published limits, per IP, so for the whole server: 10 search queries a minute; going over risks a
// ban, and global limits answer 503. The route (routes/snackSearch.ts) keeps under them with
// limits.ts; this module only talks to the service, and never throws.

export type SearchHit = {
  barcode: string;
  name: string | null;
  brand: string | null;
  ingredientsText: string | null;
  allergensTags: string[];
  tracesTags: string[];
  lastUpdated: Date | null;
  raw: unknown;
};

export type SearchOutcome = { status: "ok"; hits: SearchHit[] } | { status: "failed" };

export const SEARCH_PAGE_SIZE = 20;
const FETCH_TIMEOUT_MS = 8000;

/** Digits, 6 to 14: exactly what the scan route accepts as a typed barcode (routes/scans.ts BARCODE_PATTERN). */
const BARCODE_SHAPE = /^\d{6,14}$/;

type OffSearchResponse = {
  products?: Array<{
    code?: string;
    product_name?: string;
    brands?: string;
    ingredients_text?: string;
    allergens_tags?: string[];
    traces_tags?: string[];
    last_modified_t?: number;
  }>;
};

export function searchUrl(query: string): URL {
  const url = new URL("https://world.openfoodfacts.org/cgi/search.pl");
  url.searchParams.set("search_terms", query);
  url.searchParams.set("search_simple", "1");
  url.searchParams.set("action", "process");
  url.searchParams.set("json", "1");
  url.searchParams.set("page_size", String(SEARCH_PAGE_SIZE));
  url.searchParams.set("fields", "code,product_name,brands,ingredients_text,allergens_tags,traces_tags,last_modified_t");
  return url;
}

/**
 * "ok" with the hits worth showing: a barcode the scan route would accept, and a name or a brand to
 * show (a hit with neither can't be told apart from another). One hit per barcode. "failed" for a
 * timeout, network error, any non-2xx (the 503 of a global limit included) or an unreadable reply:
 * the route says it couldn't reach Open Food Facts, never that nothing matched.
 */
export async function searchProducts(query: string): Promise<SearchOutcome> {
  try {
    const res = await fetch(searchUrl(query), {
      headers: { "User-Agent": env.offUserAgent },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return { status: "failed" };

    const data = (await res.json()) as OffSearchResponse | null;
    if (!data || typeof data !== "object" || !Array.isArray(data.products)) return { status: "failed" };

    const seen = new Set<string>();
    const hits: SearchHit[] = [];
    for (const p of data.products) {
      const barcode = typeof p.code === "string" ? p.code.trim() : "";
      if (!BARCODE_SHAPE.test(barcode) || seen.has(barcode)) continue;
      const name = p.product_name?.trim() || null;
      const brand = p.brands?.trim() || null;
      if (!name && !brand) continue;
      seen.add(barcode);
      hits.push({
        barcode,
        name,
        brand,
        ingredientsText: p.ingredients_text?.trim() || null,
        allergensTags: (p.allergens_tags ?? []).map(normalizeTag),
        tracesTags: (p.traces_tags ?? []).map(normalizeTag),
        lastUpdated: p.last_modified_t ? new Date(p.last_modified_t * 1000) : null,
        raw: { source: "open_food_facts_search", product: p },
      });
    }
    return { status: "ok", hits };
  } catch {
    return { status: "failed" };
  }
}
