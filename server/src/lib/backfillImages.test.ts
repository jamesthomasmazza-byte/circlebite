import assert from "node:assert/strict";
import { after, afterEach, test } from "node:test";

import { pool } from "../db/pool.js";
import { backfillProductImages } from "./backfillImages.js";
import { SEED_PRODUCT_MARKER } from "./productLookup.js";

// The one-off image backfill (JT, Nov 14): only the found, non-seed rows with no image are asked
// about, and only their image fields change.

const MISSING = "1890000000019"; // found, no image → Open Food Facts has one
const NO_IMAGE_THERE = "1890000000026"; // found, no image → Open Food Facts has none either
const GONE = "1890000000033"; // found here, not found there any more
const HAS_IMAGE = "1890000000040"; // already has one: not asked about
const SEEDED = "1890000000057"; // the seed's: never asked about
const NOT_FOUND_ROW = "1890000000064"; // a not-found row: not a product to picture
const ALL = [MISSING, NO_IMAGE_THERE, GONE, HAS_IMAGE, SEEDED, NOT_FOUND_ROW];

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});
after(async () => {
  await pool.query("DELETE FROM products WHERE barcode = ANY($1)", [ALL]);
  await pool.end();
});

test("walks found, non-seed rows without an image; saves image fields only; counts the rest", async () => {
  await pool.query("DELETE FROM products WHERE barcode = ANY($1)", [ALL]);
  await pool.query(
    `INSERT INTO products (barcode, found, name, allergens_tags, raw_data, fetched_at, image_front_small_url, image_front_url) VALUES
       ($1, true, 'Missing', '{peanut}', 'null', now() - interval '2 days', NULL, NULL),
       ($2, true, 'No image there', '{}', 'null', now() - interval '2 days', NULL, NULL),
       ($3, true, 'Gone', '{}', 'null', now() - interval '2 days', NULL, NULL),
       ($4, true, 'Has image', '{}', 'null', now() - interval '2 days', 'https://images.openfoodfacts.org/a.200.jpg', 'https://images.openfoodfacts.org/a.400.jpg'),
       ($5, true, 'Seeded', '{}', $7, now() - interval '2 days', NULL, NULL),
       ($6, false, NULL, '{}', 'null', now() - interval '2 days', NULL, NULL)`,
    [MISSING, NO_IMAGE_THERE, GONE, HAS_IMAGE, SEEDED, NOT_FOUND_ROW, JSON.stringify({ [SEED_PRODUCT_MARKER]: true })],
  );

  const asked: string[] = [];
  globalThis.fetch = (async (input: string | URL | Request) => {
    const barcode = new URL(String(input)).pathname.match(/product\/(\d+)\.json/)?.[1] ?? "";
    asked.push(barcode);
    const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
    if (barcode === MISSING) {
      return json({
        status: 1,
        product: {
          product_name: "Missing, renamed upstream",
          allergens_tags: ["en:milk"],
          image_front_small_url: "https://images.openfoodfacts.org/m.200.jpg",
          image_front_url: "https://images.openfoodfacts.org/m.400.jpg",
        },
      });
    }
    if (barcode === NO_IMAGE_THERE) return json({ status: 1, product: { product_name: "No image there" } });
    return json({ status: 0 }, 404);
  }) as typeof fetch;

  const counts = await backfillProductImages(0, { only: ALL });
  assert.deepEqual(counts, { candidates: 3, updated: 1, no_image: 1, not_found: 1, failed: 0 });
  assert.deepEqual(asked.sort(), [MISSING, NO_IMAGE_THERE, GONE].sort(), "only the found, non-seed rows without an image");

  const { rows } = await pool.query("SELECT barcode, name, allergens_tags, image_front_small_url, image_front_url FROM products WHERE barcode = ANY($1) ORDER BY barcode", [[MISSING, NO_IMAGE_THERE, HAS_IMAGE, SEEDED]]);
  const by = Object.fromEntries(rows.map((r) => [r.barcode, r]));
  assert.equal(by[MISSING].image_front_small_url, "https://images.openfoodfacts.org/m.200.jpg");
  assert.equal(by[MISSING].image_front_url, "https://images.openfoodfacts.org/m.400.jpg");
  assert.equal(by[MISSING].name, "Missing", "only the image fields changed");
  assert.deepEqual(by[MISSING].allergens_tags, ["peanut"], "the allergen tags did not move");
  assert.equal(by[NO_IMAGE_THERE].image_front_small_url, null);
  assert.equal(by[HAS_IMAGE].image_front_small_url, "https://images.openfoodfacts.org/a.200.jpg");
  assert.equal(by[SEEDED].image_front_small_url, null);
});

test("a failed read is counted and left alone for the next scan", async () => {
  await pool.query("DELETE FROM products WHERE barcode = ANY($1)", [ALL]);
  await pool.query("INSERT INTO products (barcode, found, name, allergens_tags, raw_data, fetched_at) VALUES ($1, true, 'Missing', '{}', 'null', now())", [MISSING]);
  globalThis.fetch = (async () => new Response("Service Unavailable", { status: 503 })) as typeof fetch;
  assert.deepEqual(await backfillProductImages(0, { only: ALL }), { candidates: 1, updated: 0, no_image: 0, not_found: 0, failed: 1 });
  const { rows } = await pool.query("SELECT image_front_small_url FROM products WHERE barcode = $1", [MISSING]);
  assert.equal(rows[0].image_front_small_url, null);
});
