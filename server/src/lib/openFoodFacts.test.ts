import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import { fetchProduct } from "./openFoodFacts.js";

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
