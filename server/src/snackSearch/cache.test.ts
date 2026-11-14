import assert from "node:assert/strict";
import { test } from "node:test";

import { CACHE_MAX_ENTRIES, CACHE_TTL_MS, SearchCache, cacheKey } from "./cache.js";

// The in-memory results cache (docs/snack-list-plan.md addendum, 2026-11-14): a day, 500 queries.

test("a day and 500 entries", () => {
  assert.equal(CACHE_TTL_MS, 24 * 60 * 60 * 1000);
  assert.equal(CACHE_MAX_ENTRIES, 500);
});

test("the key folds case and whitespace, so the same words are one query", () => {
  assert.equal(cacheKey("  Peanut   Butter\tCrackers "), "peanut butter crackers");
  assert.equal(cacheKey("peanut butter crackers"), "peanut butter crackers");
});

test("an entry is served until the day is up, then gone", () => {
  let t = 0;
  const cache = new SearchCache<string>(() => t);
  cache.set("a", "hits");
  t = CACHE_TTL_MS - 1;
  assert.equal(cache.get("a"), "hits");
  t = CACHE_TTL_MS;
  assert.equal(cache.get("a"), undefined);
  assert.equal(cache.size, 0);
});

test("over the cap the oldest entry goes first; re-setting a key makes it newest", () => {
  const cache = new SearchCache<number>(() => 0, CACHE_TTL_MS, 3);
  cache.set("a", 1);
  cache.set("b", 2);
  cache.set("c", 3);
  cache.set("a", 11); // a is now the newest
  cache.set("d", 4); // b, the oldest, goes
  assert.equal(cache.size, 3);
  assert.equal(cache.get("b"), undefined);
  assert.equal(cache.get("a"), 11);
  assert.equal(cache.get("c"), 3);
  assert.equal(cache.get("d"), 4);
});
