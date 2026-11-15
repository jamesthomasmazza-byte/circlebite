import assert from "node:assert/strict";
import { after, afterEach, before, beforeEach, test } from "node:test";

import { JUDGE_LINK_POOL_EMAILS } from "../db/seed/seedData.js";
import { pool } from "../db/pool.js";
import { env } from "../env.js";
import { SEED_PRODUCT_MARKER } from "../lib/productLookup.js";
import { resetSnackSearchState, snackSearchRouter } from "./snackSearch.js";

// The snack search routes (docs/snack-list-plan.md addendum, 2026-11-14). Same technique as
// snackList.test.ts: each handler is found on the router and called past requireAuth with a fake
// req/res. The local search runs against Postgres; Open Food Facts is a fake fetch. Nothing here
// calls the AI, and nothing is added to any list.

const USER = { id: "aaaaaaaa-0000-0000-0000-0000000000f1", email: "search-owner@example.com" };
const JUDGE = { id: "aaaaaaaa-0000-0000-0000-0000000000f2", email: JUDGE_LINK_POOL_EMAILS[0] };

// Local rows: a prefix of their own and a brand of their own (the local database may hold the judge
// seed's products too), cleaned up after.
const CRACKERS = "7500000000011";
const PEANUT_BAR = "7500000000012";
const NOT_FOUND = "7500000000013";
const NAMELESS = "7500000000014";
const UNDERSCORE = "7500000000015";
const SEEDED = "7500000000016";
// Hits the fake Open Food Facts answers with.
const OFF_A = "7500000000101";
const OFF_B = "7500000000102";
const LOCAL_BARCODES = [CRACKERS, PEANUT_BAR, NOT_FOUND, NAMELESS, UNDERSCORE, SEEDED];
const OFF_BARCODES = [OFF_A, OFF_B];

type Captured = { status: number; body: unknown };
type Result = { barcode: string; name: string | null; brand: string | null };
type Body = { query: string; source: string; cached?: boolean; results: Result[] };

function call(path: string, q: unknown, user: { id: string; email: string }): Promise<Captured> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const layer = (snackSearchRouter as any).stack.find((l: any) => l.route?.path === path && l.route.methods.get);
  assert.ok(layer, `expected a registered GET ${path} route`);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const stack = layer.route.stack.slice(1).map((l: any) => l.handle);
  return new Promise((resolve, reject) => {
    let status = 200;
    const res = {
      status(code: number) {
        status = code;
        return res;
      },
      json(payload: unknown) {
        resolve({ status, body: payload });
      },
    };
    const req = { query: { q }, user };
    const run = (i: number) => {
      if (i >= stack.length) {
        reject(new Error("route ran out of handlers without responding"));
        return;
      }
      stack[i](req, res, (err?: unknown) => {
        if (err) {
          const e = err as { status?: number; code?: string; detail?: Record<string, unknown> };
          resolve({ status: e.status ?? 500, body: { ...(e.detail ?? {}), error: e.code } });
          return;
        }
        run(i + 1);
      });
    };
    run(0);
  });
}
const local = (q: unknown, user = USER) => call("/snacks/search", q, user);
const more = (q: unknown, user = USER) => call("/snacks/search/more", q, user);
const results = (c: Captured) => (c.body as Body).results;
const barcodes = (c: Captured) => results(c).map((r) => r.barcode);

// The fake Open Food Facts: counts calls, answers what it's told to.
const realFetch = globalThis.fetch;
let offCalls = 0;
let offAnswer: () => Response | Promise<Response> = () => new Response("", { status: 503 });
function offAnswers(products: unknown[]) {
  offAnswer = () => new Response(JSON.stringify({ count: products.length, products }), { status: 200, headers: { "content-type": "application/json" } });
}
const HITS = [
  { code: OFF_A, product_name: "Peanut Butter Pretzels", brands: "Kirkland Signature", ingredients_text: "wheat flour, peanut butter", allergens_tags: ["en:gluten", "en:peanuts"], traces_tags: [], last_modified_t: 1700000000, image_front_small_url: "https://images.openfoodfacts.org/images/products/750/000/000/0101/front_en.3.200.jpg", image_front_url: "https://images.openfoodfacts.org/images/products/750/000/000/0101/front_en.3.400.jpg" },
  { code: OFF_B, product_name: "Peanut Puffs", brands: "Snackco", allergens_tags: ["en:peanuts"] },
  { code: SEEDED, product_name: "An outside record of the seeded barcode", brands: "Someone" },
];

let previousSwitch: boolean;
let clock = 1_700_000_000_000;

before(async () => {
  previousSwitch = env.snackSearch;
  env.snackSearch = true;
  await pool.query(
    `INSERT INTO products (barcode, found, name, brand, ingredients_text, allergens_tags, traces_tags, raw_data, fetched_at) VALUES
       ($1, true, 'Plain Rice Crackers', 'Testbrook', 'rice, salt', '{}', '{}', 'null', now()),
       ($2, true, 'Crunchy Peanut Bar', 'Testbrook', 'peanuts, honey', '{peanut}', '{}', 'null', now()),
       ($3, false, NULL, NULL, NULL, '{}', '{}', 'null', now()),
       ($4, true, NULL, NULL, 'oats, sugar', '{}', '{}', 'null', now()),
       ($5, true, 'Snack_Mix 100%', 'Percent Foods', NULL, '{}', '{}', 'null', now()),
       ($6, true, 'Seeded Oat Biscuits', 'Testbrook', 'oats', '{}', '{sesame}', $7, now())`,
    [CRACKERS, PEANUT_BAR, NOT_FOUND, NAMELESS, UNDERSCORE, SEEDED, JSON.stringify({ [SEED_PRODUCT_MARKER]: true })],
  );
});

let waits: number[] = [];
beforeEach(() => {
  waits = [];
  resetSnackSearchState(
    () => clock,
    async (ms) => {
      waits.push(ms);
      clock += ms;
    },
  );
  offCalls = 0;
  globalThis.fetch = (async () => {
    offCalls += 1;
    return offAnswer();
  }) as typeof fetch;
});

afterEach(async () => {
  globalThis.fetch = realFetch;
  await pool.query("DELETE FROM products WHERE barcode = ANY($1)", [OFF_BARCODES]);
});

after(async () => {
  env.snackSearch = previousSwitch;
  await pool.query("DELETE FROM products WHERE barcode = ANY($1)", [[...LOCAL_BARCODES, ...OFF_BARCODES]]);
  await pool.end();
});

test("with SNACK_SEARCH off both routes are a plain 404 and nothing is called", async () => {
  env.snackSearch = false;
  try {
    assert.equal((await local("peanut")).status, 404);
    assert.equal((await more("peanut")).status, 404);
    assert.equal(offCalls, 0);
  } finally {
    env.snackSearch = true;
  }
});

test("a query under 2 or over 80 characters is a 400 on both routes", async () => {
  assert.equal((await local("p")).status, 400);
  assert.equal((await local("x".repeat(81))).status, 400);
  assert.equal((await local(undefined)).status, 400);
  assert.equal((await more(" ")).status, 400);
  assert.equal(offCalls, 0);
});

test("local: every word must match the name or brand, in any order, case-insensitive; found rows with something to show; name, brand and barcode only", async () => {
  const r = await local("  BAR   testbrook ");
  assert.equal(r.status, 200);
  assert.equal((r.body as Body).query, "BAR testbrook");
  assert.equal((r.body as Body).source, "local");
  assert.deepEqual(results(r), [{ barcode: PEANUT_BAR, name: "Crunchy Peanut Bar", brand: "Testbrook" }]);
  assert.deepEqual(Object.keys(results(r)[0]).sort(), ["barcode", "brand", "name"], "no verdict in a result");

  const brand = await local("testbrook");
  assert.deepEqual(barcodes(brand), [PEANUT_BAR, CRACKERS, SEEDED], "by name: Crunchy…, Plain…, Seeded…");
  assert.ok(!barcodes(await local("oats")).includes(NAMELESS), "a row with no name and no brand has nothing to show");
  assert.ok(!barcodes(await local("oats")).includes(NOT_FOUND), "a not-found row isn't a product");
  assert.deepEqual(barcodes(await local("snack_mix 100%")), [UNDERSCORE], "LIKE's own characters match themselves");
  assert.deepEqual(barcodes(await local("snackmix")), [], "_ is not a wildcard");
  assert.equal(offCalls, 0, "the local search never calls Open Food Facts");
});

test("more: hits come back as results, each written to products as a product lookup would, the seed row untouched; the same query again is served from the cache", async () => {
  offAnswers(HITS);
  const r = await more("peanut");
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal((r.body as Body).source, "open_food_facts");
  assert.equal((r.body as Body).cached, false);
  assert.deepEqual(results(r), [
    { barcode: OFF_A, name: "Peanut Butter Pretzels", brand: "Kirkland Signature" },
    { barcode: OFF_B, name: "Peanut Puffs", brand: "Snackco" },
    { barcode: SEEDED, name: "An outside record of the seeded barcode", brand: "Someone" },
  ]);
  assert.equal(offCalls, 1);

  const { rows } = await pool.query(
    "SELECT barcode, found, name, brand, ingredients_text, allergens_tags, traces_tags, raw_data->>'source' AS source, product_last_updated FROM products WHERE barcode = ANY($1) ORDER BY barcode",
    [[OFF_A, OFF_B, SEEDED]],
  );
  assert.deepEqual(
    rows.map((row) => [row.barcode, row.found, row.name, row.brand, row.ingredients_text, row.allergens_tags, row.traces_tags, row.source]),
    [
      [SEEDED, true, "Seeded Oat Biscuits", "Testbrook", "oats", [], ["sesame"], null],
      [OFF_A, true, "Peanut Butter Pretzels", "Kirkland Signature", "wheat flour, peanut butter", ["gluten", "peanuts"], [], "open_food_facts_search"],
      [OFF_B, true, "Peanut Puffs", "Snackco", null, ["peanuts"], [], "open_food_facts_search"],
    ],
  );
  assert.equal((rows[1].product_last_updated as Date).getTime(), 1700000000 * 1000);
  const { rows: images } = await pool.query("SELECT image_front_small_url, image_front_url FROM products WHERE barcode = ANY($1) ORDER BY barcode", [[OFF_A, OFF_B]]);
  assert.deepEqual(images, [
    { image_front_small_url: "https://images.openfoodfacts.org/images/products/750/000/000/0101/front_en.3.200.jpg", image_front_url: "https://images.openfoodfacts.org/images/products/750/000/000/0101/front_en.3.400.jpg" },
    { image_front_small_url: null, image_front_url: null },
  ]);

  const again = await more("  PEANUT ");
  assert.equal(again.status, 200);
  assert.equal((again.body as Body).cached, true);
  assert.deepEqual(barcodes(again), barcodes(r));
  assert.equal(offCalls, 1, "a cache hit makes no call");
});

test("more: when Open Food Facts doesn't answer twice, the route says so (502), never that nothing matched; both calls counted, nothing cached", async () => {
  offAnswer = () => new Response("<html>Page temporarily unavailable</html>", { status: 503 });
  const r = await more("peanut");
  assert.equal(r.status, 502);
  assert.deepEqual(r.body, { error: "search_unavailable" });
  assert.equal(offCalls, 2, "the first call and its one retry");
  assert.deepEqual(waits, [1500]);
  offAnswers([]);
  const empty = await more("peanut");
  assert.equal(empty.status, 200, "a failure is not cached");
  assert.deepEqual(results(empty), []);
  assert.equal(offCalls, 3);
});

// The one retry (JT, Nov 15): a 503, 429 or timeout is tried once more after 1.5 s, from the same
// budgets; anything else fails at once.
test("more: a 503, a 429 or a timeout is retried once after 1.5 s and the retry's answer is the result; the retry counts against the minute's budget", async () => {
  for (const [what, failure] of [
    ["503", () => new Response("", { status: 503 })],
    ["429", () => new Response("", { status: 429 })],
    ["timeout", () => Promise.reject(new DOMException("The operation was aborted due to timeout", "TimeoutError"))],
  ] as const) {
    resetSnackSearchState(() => clock, async (ms) => void waits.push(ms));
    waits = [];
    offCalls = 0;
    let calls = 0;
    offAnswer = () => {
      calls += 1;
      return calls === 1 ? failure() : new Response(JSON.stringify({ products: [{ code: OFF_B, product_name: "Rice Crackers", brands: "Hearthfield" }] }), { status: 200 });
    };
    const r = await more(`retry ${what}`);
    assert.equal(r.status, 200, what);
    assert.deepEqual(results(r), [{ barcode: OFF_B, name: "Rice Crackers", brand: "Hearthfield" }], what);
    assert.equal(offCalls, 2, what);
    assert.deepEqual(waits, [1500], what);
    // Two of the minute's eight went on that one request: six more, then busy.
    offAnswers([]);
    for (let i = 0; i < 6; i++) assert.equal((await more(`${what} fill ${i}`, { id: `fill-${i}`, email: `f${i}@example.com` })).status, 200, `${what} fill ${i + 1}`);
    assert.equal((await more(`${what} ninth`, { id: "ninth", email: "ninth@example.com" })).status, 503, `${what}: the budget counted the retry`);
  }
});

test("more: a failure that a retry wouldn't mend — a 500, unreadable JSON, a network error — is a 502 at once, one call, no wait", async () => {
  for (const failure of [() => new Response("", { status: 500 }), () => new Response("{not json", { status: 200 }), () => Promise.reject(new TypeError("fetch failed"))]) {
    offCalls = 0;
    waits = [];
    offAnswer = failure;
    const r = await more(`plain ${offCalls}${Math.random()}`);
    assert.equal(r.status, 502);
    assert.equal(offCalls, 1);
    assert.deepEqual(waits, []);
  }
});

test("more: with the minute's budget empty the retry is skipped and the page is told busy; with the account's hour used up there is no retry and the first failure stands", async () => {
  offAnswers([]);
  for (let i = 0; i < 7; i++) assert.equal((await more(`spend ${i}`, { id: `spend-${i}`, email: `s${i}@example.com` })).status, 200);
  offAnswer = () => new Response("", { status: 503 });
  const eighth = await more("eighth", { id: "eighth", email: "eighth@example.com" });
  assert.equal(eighth.status, 503);
  assert.deepEqual(eighth.body, { error: "search_busy" });
  assert.equal(offCalls, 8, "the eighth call went out; its retry did not");
  assert.deepEqual(waits, [1500]);

  // A judge-link account's 8th call of the hour fails: its retry would be the 9th, so none; a 502.
  resetSnackSearchState(() => clock, async (ms) => void waits.push(ms));
  waits = [];
  offCalls = 0;
  offAnswers([]);
  for (let i = 0; i < 7; i++) {
    assert.equal((await more(`judge hour ${i}`, JUDGE)).status, 200);
    clock += 60_000;
  }
  offAnswer = () => new Response("", { status: 503 });
  const last = await more("judge hour 8", JUDGE);
  assert.equal(last.status, 502);
  assert.deepEqual(last.body, { error: "search_unavailable" });
  assert.equal(offCalls, 8);
  assert.deepEqual(waits, [1500]);
});

test("more: a regular account's 21st real call in an hour is a 429, a judge-link account's 9th; cache hits don't count", async () => {
  offAnswers([]);
  for (let i = 0; i < 20; i++) {
    assert.equal((await more(`query ${i}`)).status, 200, `call ${i + 1}`);
    clock += 60_000; // spread out, so the process budget isn't what trips
  }
  assert.equal((await more("query 0")).status, 200, "a cached query is free");
  const over = await more("query 21");
  assert.equal(over.status, 429);
  assert.deepEqual(over.body, { error: "search_limit" });

  resetSnackSearchState(() => clock);
  for (let i = 0; i < 8; i++) {
    assert.equal((await more(`judge ${i}`, JUDGE)).status, 200, `judge call ${i + 1}`);
    clock += 60_000;
  }
  assert.equal((await more("judge 9", JUDGE)).status, 429);
  assert.equal((await more("judge 9", USER)).status, 200, "another account is unaffected");
});

test("more: the 9th real call in a minute across every account is a 503 search_busy, and nothing is called", async () => {
  offAnswers([]);
  for (let i = 0; i < 8; i++) assert.equal((await more(`busy ${i}`, { id: `user-${i}`, email: `u${i}@example.com` })).status, 200);
  assert.equal(offCalls, 8);
  const busy = await more("busy 9", { id: "user-9", email: "u9@example.com" });
  assert.equal(busy.status, 503);
  assert.deepEqual(busy.body, { error: "search_busy" });
  assert.equal(offCalls, 8);
});
