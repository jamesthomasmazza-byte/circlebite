import assert from "node:assert/strict";
import { test } from "node:test";

import { PROCESS_BUDGET_PER_MINUTE, SEARCHES_PER_HOUR, SearchLimits } from "./limits.js";

// The two in-memory limits on real Open Food Facts search calls (docs/snack-list-plan.md addendum;
// JT, Nov 14: 20 an hour per regular account, 8 per judge-link account, 8 a minute for the process).

function clock(start = 1_700_000_000_000) {
  let t = start;
  return { now: () => t, advance: (ms: number) => (t += ms) };
}

test("the numbers JT set", () => {
  assert.equal(SEARCHES_PER_HOUR.regular, 20);
  assert.equal(SEARCHES_PER_HOUR.judgeLink, 8);
  assert.equal(PROCESS_BUDGET_PER_MINUTE, 8);
});

test("a regular account gets 20 calls an hour, then is told it's over its own limit, and gets one back as the oldest ages out", () => {
  const c = clock();
  const limits = new SearchLimits(c.now);
  for (let i = 0; i < 20; i++) {
    assert.equal(limits.take("u1", false), "ok", `call ${i + 1}`);
    c.advance(60_000); // one a minute, so the process budget is never the reason
  }
  assert.equal(limits.take("u1", false), "user_limit");
  assert.equal(limits.take("u1", false), "user_limit", "a refused call counts nothing");
  c.advance(60 * 60_000 - 20 * 60_000 + 1); // the first call is now just over an hour old
  assert.equal(limits.take("u1", false), "ok");
  assert.equal(limits.take("u1", false), "user_limit");
});

test("a judge-link account gets 8 an hour", () => {
  const c = clock();
  const limits = new SearchLimits(c.now);
  for (let i = 0; i < 8; i++) {
    assert.equal(limits.take("judge", true), "ok");
    c.advance(60_000);
  }
  assert.equal(limits.take("judge", true), "user_limit");
  assert.equal(limits.take("someone-else", false), "ok", "another account is unaffected");
});

test("the process budget: 8 real calls a minute across every account, then busy, then the budget returns as calls age out", () => {
  const c = clock();
  const limits = new SearchLimits(c.now);
  for (let i = 0; i < 8; i++) assert.equal(limits.take(`user-${i}`, false), "ok");
  assert.equal(limits.take("user-9", false), "busy");
  c.advance(30_000);
  assert.equal(limits.take("user-9", false), "busy", "half a minute on, all eight still count");
  c.advance(30_000 + 1); // the first eight are now just over a minute old
  for (let i = 0; i < 8; i++) assert.equal(limits.take(`user-${i}`, false), "ok", `call ${i + 1} of the next minute`);
  assert.equal(limits.take("user-9", false), "busy");
});

test("an account over its own limit is told so even when the server is also busy, and busy counts against nobody", () => {
  const c = clock();
  const limits = new SearchLimits(c.now);
  for (let i = 0; i < 8; i++) assert.equal(limits.take("judge", true), "ok");
  assert.equal(limits.take("judge", true), "user_limit");
  assert.equal(limits.take("other", false), "busy");
  c.advance(60_000 + 1);
  assert.equal(limits.take("other", false), "ok", "the refused call didn't count against the account");
});
