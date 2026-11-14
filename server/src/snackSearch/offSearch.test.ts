import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import { SEARCH_PAGE_SIZE, searchProducts, searchUrl } from "./offSearch.js";

// What searchProducts makes of Open Food Facts' text search answers (docs/snack-list-plan.md
// addendum, 2026-11-14). Same posture as lib/openFoodFacts.test.ts: anything that isn't an answer is
// "failed", never an empty result.

const realFetch = globalThis.fetch;
let requested: URL | undefined;
let userAgent: string | null | undefined;
afterEach(() => {
  globalThis.fetch = realFetch;
  requested = undefined;
});

function respond(status: number, body: string) {
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    requested = new URL(String(input));
    userAgent = new Headers(init?.headers).get("User-Agent");
    return new Response(body, { status, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
}

test("the request: the legacy search.pl with the product lookup's fields, 20 a page, the app's User-Agent", async () => {
  respond(200, JSON.stringify({ products: [] }));
  await searchProducts("peanut butter crackers");
  assert.ok(requested);
  assert.equal(requested.origin + requested.pathname, "https://world.openfoodfacts.org/cgi/search.pl");
  assert.equal(requested.searchParams.get("search_terms"), "peanut butter crackers");
  assert.equal(requested.searchParams.get("search_simple"), "1");
  assert.equal(requested.searchParams.get("action"), "process");
  assert.equal(requested.searchParams.get("json"), "1");
  assert.equal(requested.searchParams.get("page_size"), String(SEARCH_PAGE_SIZE));
  assert.equal(requested.searchParams.get("fields"), "code,product_name,brands,ingredients_text,allergens_tags,traces_tags,last_modified_t,image_front_small_url,image_front_url");
  assert.ok(userAgent && userAgent.length > 0, "a User-Agent identifies the app, as the service asks");
  assert.equal(searchUrl("a b").searchParams.get("search_terms"), "a b");
});

test("hits: barcode, name, brand, the product fields with tags normalized; no barcode, a bad barcode, nothing to show, or a repeat is skipped", async () => {
  respond(
    200,
    JSON.stringify({
      count: 306,
      products: [
        {
          code: "0096619336753",
          product_name: " Peanut Butter Pretzels ",
          brands: "Kirkland Signature",
          ingredients_text: "wheat flour, peanut butter",
          allergens_tags: ["en:gluten", "en:peanuts"],
          traces_tags: ["en:tree-nuts"],
          last_modified_t: 1700000000,
          image_front_small_url: "https://images.openfoodfacts.org/images/products/009/661/933/6753/front_en.3.200.jpg",
          image_front_url: "https://images.openfoodfacts.org/images/products/009/661/933/6753/front_en.3.400.jpg",
        },
        { code: "80001157", brands: "Loacker" },
        { product_name: "No code at all" },
        { code: "not-a-barcode", product_name: "Odd" },
        { code: "0096619336753", product_name: "Repeat" },
        { code: "0044000024970" },
      ],
    }),
  );
  const r = await searchProducts("peanut");
  assert.equal(r.status, "ok");
  assert.ok(r.status === "ok");
  assert.deepEqual(
    r.hits.map((h) => [h.barcode, h.name, h.brand]),
    [
      ["0096619336753", "Peanut Butter Pretzels", "Kirkland Signature"],
      ["80001157", null, "Loacker"],
    ],
  );
  const first = r.hits[0];
  assert.equal(first.ingredientsText, "wheat flour, peanut butter");
  assert.deepEqual(first.allergensTags, ["gluten", "peanuts"]);
  assert.deepEqual(first.tracesTags, ["tree nuts"]);
  assert.equal(first.lastUpdated?.getTime(), 1700000000 * 1000);
  assert.deepEqual((first.raw as { source: string }).source, "open_food_facts_search");
  assert.equal(first.imageSmallUrl, "https://images.openfoodfacts.org/images/products/009/661/933/6753/front_en.3.200.jpg");
  assert.equal(first.imageUrl, "https://images.openfoodfacts.org/images/products/009/661/933/6753/front_en.3.400.jpg");
  assert.equal(r.hits[1].imageSmallUrl, null);
  assert.equal(r.hits[1].ingredientsText, null);
  assert.deepEqual(r.hits[1].allergensTags, []);
});

test("no matches is ok with no hits, not a failure", async () => {
  respond(200, JSON.stringify({ count: 0, products: [] }));
  assert.deepEqual(await searchProducts("zzzz"), { status: "ok", hits: [] });
});

for (const [name, setup] of [
  ["a 503 (a global limit)", () => respond(503, "<html>Page temporarily unavailable</html>")],
  ["a 429", () => respond(429, "")],
  ["unreadable JSON on a 200", () => respond(200, "{not json")],
  ["a 200 without a products array", () => respond(200, JSON.stringify({ count: 1 }))],
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
  test(`${name} is failed, and nothing throws`, async () => {
    setup();
    assert.deepEqual(await searchProducts("peanut"), { status: "failed" });
  });
}
