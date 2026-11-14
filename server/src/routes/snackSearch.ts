import { Router } from "express";

import { isJudgeLinkAccount } from "../auth/judgeLinkRules.js";
import { requireAuth } from "../auth/requireAuth.js";
import { pool } from "../db/pool.js";
import { env } from "../env.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { HttpError } from "../lib/httpError.js";
import { SEED_PRODUCT_MARKER } from "../lib/productLookup.js";
import { SearchCache, cacheKey } from "../snackSearch/cache.js";
import { SearchLimits } from "../snackSearch/limits.js";
import { searchProducts, type SearchHit } from "../snackSearch/offSearch.js";

// Snack search (docs/snack-list-plan.md addendum, 2026-11-14): the search box on the Snacks tab.
//
//   GET /snacks/search?q=…        our own `products` table, no outside call, no limit
//   GET /snacks/search/more?q=…   Open Food Facts' text search through the server, cached a day and
//                                  limited per account and for the whole process (snackSearch/)
//
// Results carry a barcode, a name and a brand, never a verdict: a result isn't checked until it's
// opened, and tapping one runs the existing typed-barcode scan for the chosen profile. Search adds
// nothing to any list by itself. Per-route requireAuth and a plain 404 while SNACK_SEARCH is off,
// like routes/snackList.ts. Judge-link sessions may search, under the tighter account limit.
export const snackSearchRouter = Router();

export const QUERY_MIN = 2;
export const QUERY_MAX = 80;
const LOCAL_LIMIT = 20;

export type SearchResult = { barcode: string; name: string | null; brand: string | null };

// One limiter and one cache for the process; `resetSnackSearchState` lets tests start clean or run
// against their own clock.
let limits = new SearchLimits();
let cache = new SearchCache<SearchResult[]>();
export function resetSnackSearchState(now?: () => number): void {
  limits = new SearchLimits(now);
  cache = new SearchCache<SearchResult[]>(now);
}

function requireSnackSearchEnabled(_req: unknown, _res: unknown, next: (err?: unknown) => void) {
  if (!env.snackSearch) {
    next(new HttpError(404, "not_found"));
    return;
  }
  next();
}

/** The query, trimmed with inner whitespace collapsed; too short or too long is a 400. */
function parseQuery(raw: unknown): string {
  if (typeof raw !== "string") throw new HttpError(400, "invalid_query");
  const query = raw.trim().replace(/\s+/g, " ");
  if (query.length < QUERY_MIN || query.length > QUERY_MAX) throw new HttpError(400, "invalid_query", { min: QUERY_MIN, max: QUERY_MAX });
  return query;
}

/** `%`, `_` and `\` mean something to LIKE; a typed one should match itself. */
function likeWord(word: string): string {
  return `%${word.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

snackSearchRouter.get(
  "/snacks/search",
  requireAuth,
  requireSnackSearchEnabled,
  asyncHandler(async (req, res) => {
    const query = parseQuery(req.query.q);
    // Every word somewhere in the name or brand, in any order: "peanut bar" finds "Crunchy Peanut
    // Bar". Rows a lookup found and that have something to show. The judge seed's products are rows
    // like any other, so a judge finds "Hearthfield" here.
    const words = query.split(" ").map(likeWord);
    const { rows } = await pool.query<SearchResult>(
      `SELECT barcode, name, brand FROM products
       WHERE found AND (name IS NOT NULL OR brand IS NOT NULL)
         AND (SELECT bool_and(concat_ws(' ', name, brand) ILIKE w) FROM unnest($1::text[]) AS w)
       ORDER BY name NULLS LAST, brand, barcode
       LIMIT $2`,
      [words, LOCAL_LIMIT],
    );
    res.json({ query, source: "local", results: rows });
  }),
);

snackSearchRouter.get(
  "/snacks/search/more",
  requireAuth,
  requireSnackSearchEnabled,
  asyncHandler(async (req, res) => {
    const query = parseQuery(req.query.q);
    const key = cacheKey(query);

    const cached = cache.get(key);
    if (cached) {
      res.json({ query, source: "open_food_facts", cached: true, results: cached });
      return;
    }

    // Only a real call counts, and it counts whether or not Open Food Facts answers: the IP budget
    // was spent either way.
    const outcome = limits.take(req.user!.id, isJudgeLinkAccount(req.user!.email));
    if (outcome === "user_limit") throw new HttpError(429, "search_limit");
    if (outcome === "busy") throw new HttpError(503, "search_busy");

    const found = await searchProducts(query);
    // Said as what it is (principle 2): not "nothing matched".
    if (found.status === "failed") throw new HttpError(502, "search_unavailable");

    await rememberHits(found.hits);
    const results: SearchResult[] = found.hits.map(({ barcode, name, brand }) => ({ barcode, name, brand }));
    cache.set(key, results);
    res.json({ query, source: "open_food_facts", cached: false, results });
  }),
);

/**
 * Each hit becomes a `products` row, the same shape and fields a product lookup writes
 * (lib/productLookup.ts), fetched now: the scan a result opens is served from our own table within
 * the day and spends none of Open Food Facts' product-read allowance. A seed row is never
 * overwritten (productLookup.ts: it is the record for that barcode).
 */
async function rememberHits(hits: SearchHit[]): Promise<void> {
  for (const hit of hits) {
    await pool.query(
      `INSERT INTO products
         (barcode, found, name, brand, ingredients_text, allergens_tags, traces_tags, raw_data, product_last_updated, fetched_at)
       VALUES ($1, true, $2, $3, $4, $5, $6, $7, $8, now())
       ON CONFLICT (barcode) DO UPDATE SET
         found = true,
         name = EXCLUDED.name,
         brand = EXCLUDED.brand,
         ingredients_text = EXCLUDED.ingredients_text,
         allergens_tags = EXCLUDED.allergens_tags,
         traces_tags = EXCLUDED.traces_tags,
         raw_data = EXCLUDED.raw_data,
         product_last_updated = EXCLUDED.product_last_updated,
         fetched_at = now()
       WHERE products.raw_data IS NULL OR products.raw_data->>'${SEED_PRODUCT_MARKER}' IS DISTINCT FROM 'true'`,
      [hit.barcode, hit.name, hit.brand, hit.ingredientsText, hit.allergensTags, hit.tracesTags, JSON.stringify(hit.raw), hit.lastUpdated],
    );
  }
}
