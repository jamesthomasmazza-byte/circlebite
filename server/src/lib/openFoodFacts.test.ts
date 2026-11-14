import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import { fetchProduct, OFF_PRODUCT_FIELDS, offImageUrl } from "./openFoodFacts.js";

// What fetchProduct makes of each kind of answer (BACKLOG.md, "A failed product lookup is shown as
// 'We don't have this barcode on file'"). Only Open Food Facts saying so is "not_found"; anything
// that isn't an answer is "failed". Both stay found: false, so the verdict is unchanged.

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

function respond(status: number, body: string) {
  globalThis.fetch = (async () => new Response(body, { status, headers: { "content-type": "application/json" } })) as typeof fetch;
}

const BARCODE = "1990000000099";

test("a 404 with Open Food Facts' own status 0 is not found — how it answers an unknown barcode (checked 2026-10-08)", async () => {
  respond(404, JSON.stringify({ code: BARCODE, status: 0, status_verbose: "product not found" }));
  const r = await fetchProduct(BARCODE);
  assert.equal(r.status, "not_found");
  assert.equal(r.found, false);
});

test("a 200 with status 0 is also not found", async () => {
  respond(200, JSON.stringify({ code: BARCODE, status: 0 }));
  assert.equal((await fetchProduct(BARCODE)).status, "not_found");
});

test("a found product is found", async () => {
  respond(200, JSON.stringify({ status: 1, product: { product_name: "Oat Biscuits", allergens_tags: ["en:gluten"] } }));
  const r = await fetchProduct(BARCODE);
  assert.equal(r.status, "found");
  assert.equal(r.found, true);
  assert.deepEqual(r.allergensTags, ["gluten"]);
});

for (const [name, setup] of [
  ["a 5xx", () => respond(503, "Service Unavailable")],
  ["a 429", () => respond(429, JSON.stringify({ status: 0 }))],
  ["a 404 without Open Food Facts' body", () => respond(404, "<html>Not Found</html>")],
  ["unreadable JSON on a 200", () => respond(200, "{not json")],
  ["a 200 that isn't a product", () => respond(200, JSON.stringify({ status: 1 }))],
  [
    "a network error",
    () => {
      globalThis.fetch = (async () => {
        throw new TypeError("fetch failed");
      }) as typeof fetch;
    },
  ],
  [
    "a timeout",
    () => {
      globalThis.fetch = (async () => {
        throw new DOMException("The operation was aborted due to timeout", "TimeoutError");
      }) as typeof fetch;
    },
  ],
] as const) {
  test(`${name} is a failed lookup, never "not found"`, async () => {
    setup();
    const r = await fetchProduct(BARCODE);
    assert.equal(r.status, "failed");
    assert.equal(r.found, false, "still fails closed: no product data, so Unable to confirm");
  });
}

// Product photos (JT's Snacks mockup, Nov 14): the front image URLs ride with the product.
test("the request asks for the front images with the rest, and a found product carries them when they are Open Food Facts' own https URLs", async () => {
  assert.match(OFF_PRODUCT_FIELDS, /,image_front_small_url,image_front_url$/);
  respond(
    200,
    JSON.stringify({
      status: 1,
      product: {
        product_name: "Oat Biscuits",
        image_front_small_url: "https://images.openfoodfacts.org/images/products/199/000/000/0099/front_en.4.200.jpg",
        image_front_url: "https://images.openfoodfacts.org/images/products/199/000/000/0099/front_en.4.400.jpg",
      },
    }),
  );
  const r = await fetchProduct(BARCODE);
  assert.equal(r.imageSmallUrl, "https://images.openfoodfacts.org/images/products/199/000/000/0099/front_en.4.200.jpg");
  assert.equal(r.imageUrl, "https://images.openfoodfacts.org/images/products/199/000/000/0099/front_en.4.400.jpg");
  respond(200, JSON.stringify({ status: 1, product: { product_name: "Oat Biscuits" } }));
  const none = await fetchProduct(BARCODE);
  assert.equal(none.imageSmallUrl, null);
  assert.equal(none.imageUrl, null);
});

test("an image URL is kept only when it is https on an openfoodfacts.org host", () => {
  assert.equal(offImageUrl("https://images.openfoodfacts.org/images/products/x/front.200.jpg"), "https://images.openfoodfacts.org/images/products/x/front.200.jpg");
  assert.equal(offImageUrl("https://static.openfoodfacts.org/images/x.jpg"), "https://static.openfoodfacts.org/images/x.jpg");
  for (const bad of ["http://images.openfoodfacts.org/x.jpg", "https://images.openfoodfacts.org.evil.example/x.jpg", "https://example.com/x.jpg", "not a url", "", 42, null, undefined, "javascript:alert(1)"]) {
    assert.equal(offImageUrl(bad), null, String(bad));
  }
});
