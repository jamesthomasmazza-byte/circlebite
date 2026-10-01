import assert from "node:assert/strict";
import { after, afterEach, test } from "node:test";

import { pool } from "../db/pool.js";
import { getProduct, SEED_PRODUCT_MARKER } from "./productLookup.js";

// Barcodes only this file uses — invalid GTIN check digits, like the judge seed's, under a "1"
// prefix the seed doesn't use.
const SEEDED = "1990000000013";
const ORDINARY = "1990000000020";

const realFetch = globalThis.fetch;
let fetchCalls = 0;

afterEach(() => {
  globalThis.fetch = realFetch;
});

after(async () => {
  await pool.query("DELETE FROM products WHERE barcode = ANY($1)", [[SEEDED, ORDINARY]]);
  await pool.end();
});

function failFetch() {
  fetchCalls = 0;
  globalThis.fetch = (async () => {
    fetchCalls += 1;
    throw new Error("network call attempted");
  }) as typeof fetch;
}

async function insertStale(barcode: string, raw: object) {
  await pool.query(
    `INSERT INTO products (barcode, found, name, allergens_tags, raw_data, fetched_at)
     VALUES ($1, true, 'Cached product', '{peanuts}', $2, now() - interval '3 days')
     ON CONFLICT (barcode) DO UPDATE SET raw_data = EXCLUDED.raw_data, fetched_at = EXCLUDED.fetched_at`,
    [barcode, JSON.stringify(raw)],
  );
}

test("a seeded product is never refreshed from Open Food Facts, however old its cache row", async () => {
  // Three days stale, well past the 24h TTL — an ordinary row would be refetched.
  await insertStale(SEEDED, { [SEED_PRODUCT_MARKER]: true });
  failFetch();

  const product = await getProduct(SEEDED);
  assert.equal(fetchCalls, 0, "Open Food Facts must not be called for a seeded barcode");
  assert.equal(product.found, true);
  assert.deepEqual(product.allergensTags, ["peanuts"]);
});

test("an ordinary stale row is still refreshed — the marker is the only exception", async () => {
  await insertStale(ORDINARY, { some: "real off data" });
  failFetch();

  // fetchProduct may swallow the network error into a not-found result or rethrow it; either way
  // it must have been attempted.
  await getProduct(ORDINARY).catch(() => undefined);
  assert.ok(fetchCalls > 0, "a stale ordinary row goes back to Open Food Facts");
});
