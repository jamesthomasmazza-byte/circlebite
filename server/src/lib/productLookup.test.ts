import assert from "node:assert/strict";
import { after, afterEach, test } from "node:test";

import { pool } from "../db/pool.js";
import { getProduct, resetImagesMigrationTime, SEED_PRODUCT_MARKER } from "./productLookup.js";

// Barcodes only this file uses — invalid GTIN check digits, like the judge seed's, under a "1"
// prefix the seed doesn't use.
const SEEDED = "1990000000013";
const ORDINARY = "1990000000020";
const NEVER_CACHED = "1990000000037";
const STALE_FOUND = "1990000000044";
const NOT_FOUND = "1990000000051";
const STALE_NOT_FOUND = "1990000000068";
const PRE_IMAGES = "1990000000075";
const PRE_IMAGES_SEEDED = "1990000000082";
const ALL = [SEEDED, ORDINARY, NEVER_CACHED, STALE_FOUND, NOT_FOUND, STALE_NOT_FOUND, PRE_IMAGES, PRE_IMAGES_SEEDED];

const realFetch = globalThis.fetch;
let fetchCalls = 0;

afterEach(() => {
  globalThis.fetch = realFetch;
});

after(async () => {
  await pool.query("DELETE FROM products WHERE barcode = ANY($1)", [ALL]);
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

// A failed lookup is never cached, and never replaces a product we had (BACKLOG.md, "A failed product
// lookup is shown as 'We don't have this barcode on file', and cached for a day").

function timeoutFetch() {
  fetchCalls = 0;
  globalThis.fetch = (async () => {
    fetchCalls += 1;
    throw new DOMException("The operation was aborted due to timeout", "TimeoutError");
  }) as typeof fetch;
}

async function cachedRow(barcode: string) {
  const { rows } = await pool.query("SELECT found, name, fetched_at FROM products WHERE barcode = $1", [barcode]);
  return rows[0] as { found: boolean; name: string | null; fetched_at: Date } | undefined;
}

test("a timeout with nothing cached is a failed lookup, and leaves no row behind", async () => {
  await pool.query("DELETE FROM products WHERE barcode = $1", [NEVER_CACHED]);
  timeoutFetch();

  const product = await getProduct(NEVER_CACHED);
  assert.equal(product.status, "failed");
  assert.equal(product.found, false);
  assert.equal(await cachedRow(NEVER_CACHED), undefined, "a failure is never cached as a not-found");

  // So the next scan asks again rather than reading a day-long "not on file".
  await getProduct(NEVER_CACHED);
  assert.equal(fetchCalls, 2);
});

test("a failed refresh keeps a stale product row and serves it", async () => {
  await insertStale(STALE_FOUND, { some: "real off data" });
  const before = await cachedRow(STALE_FOUND);
  timeoutFetch();

  const product = await getProduct(STALE_FOUND);
  assert.equal(fetchCalls, 1, "the refresh was attempted");
  assert.equal(product.status, "found");
  assert.equal(product.name, "Cached product");
  assert.deepEqual(product.allergensTags, ["peanuts"]);
  const after = await cachedRow(STALE_FOUND);
  assert.equal(after?.found, true, "the product's data isn't overwritten with not-found");
  assert.equal(after?.fetched_at.getTime(), before?.fetched_at.getTime(), "still stale, so the next scan tries again");
});

test("a failed refresh of a stale not-found row says the lookup failed", async () => {
  await pool.query(
    `INSERT INTO products (barcode, found, raw_data, fetched_at) VALUES ($1, false, 'null', now() - interval '3 days')
     ON CONFLICT (barcode) DO UPDATE SET found = false, fetched_at = EXCLUDED.fetched_at`,
    [STALE_NOT_FOUND],
  );
  timeoutFetch();

  assert.equal((await getProduct(STALE_NOT_FOUND)).status, "failed");
});

test("a genuine not-found (404 with status 0) is still cached, so it isn't asked for again", async () => {
  await pool.query("DELETE FROM products WHERE barcode = $1", [NOT_FOUND]);
  fetchCalls = 0;
  globalThis.fetch = (async () => {
    fetchCalls += 1;
    return new Response(JSON.stringify({ code: NOT_FOUND, status: 0, status_verbose: "product not found" }), {
      status: 404,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;

  assert.equal((await getProduct(NOT_FOUND)).status, "not_found");
  assert.equal((await cachedRow(NOT_FOUND))?.found, false);
  assert.equal((await getProduct(NOT_FOUND)).status, "not_found", "served from the cache");
  assert.equal(fetchCalls, 1);
});

// Product photos (migration 0052, Nov 14): a found row with no image, fetched before the migration,
// is stale however fresh; a seeded one, and a row fetched after it with no image, are not.
test("a found, non-seed row with no image fetched before migration 0052 is refreshed on the next lookup; a seeded one, or one fetched after, is served", async () => {
  resetImagesMigrationTime();
  const { rows } = await pool.query<{ applied_at: Date }>("SELECT applied_at FROM schema_migrations WHERE filename = '0052_products_front_images.sql'");
  assert.ok(rows[0], "the migration is applied locally");
  const before = new Date(rows[0].applied_at.getTime() - 60_000);
  await pool.query(
    `INSERT INTO products (barcode, found, name, allergens_tags, raw_data, fetched_at) VALUES
       ($1, true, 'Old Crackers', '{}', 'null', $3),
       ($2, true, 'Seeded Crackers', '{}', $4, $3)`,
    [PRE_IMAGES, PRE_IMAGES_SEEDED, before, JSON.stringify({ [SEED_PRODUCT_MARKER]: true })],
  );

  let calls = 0;
  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({ status: 1, product: { product_name: "Old Crackers", image_front_small_url: "https://images.openfoodfacts.org/images/products/199/000/000/0075/front_en.3.200.jpg", image_front_url: "https://images.openfoodfacts.org/images/products/199/000/000/0075/front_en.3.400.jpg" } }),
      { status: 200, headers: { "content-type": "application/json" } },
    )) as typeof fetch;
  globalThis.fetch = ((orig) => (async (...args: Parameters<typeof fetch>) => {
    calls += 1;
    return orig(...args);
  }) as typeof fetch)(globalThis.fetch);

  const refreshed = await getProduct(PRE_IMAGES);
  assert.equal(calls, 1, "a row from before the migration is fetched again");
  assert.equal(refreshed.imageSmallUrl, "https://images.openfoodfacts.org/images/products/199/000/000/0075/front_en.3.200.jpg");
  const { rows: saved } = await pool.query("SELECT image_front_url FROM products WHERE barcode = $1", [PRE_IMAGES]);
  assert.equal(saved[0].image_front_url, "https://images.openfoodfacts.org/images/products/199/000/000/0075/front_en.3.400.jpg");

  const again = await getProduct(PRE_IMAGES);
  assert.equal(calls, 1, "now it has an image and a fresh fetched_at: served from the table");
  assert.equal(again.imageSmallUrl, refreshed.imageSmallUrl);

  const seeded = await getProduct(PRE_IMAGES_SEEDED);
  assert.equal(calls, 1, "a seeded row is never refreshed");
  assert.equal(seeded.name, "Seeded Crackers");
});
