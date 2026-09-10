import assert from "node:assert/strict";
import { test } from "node:test";

import { parseOptionalCents, parseSwitch } from "./env.js";

test("falls back to the default when the var is unset", () => {
  assert.equal(parseOptionalCents(undefined, 200), 200);
});

test("falls back to the default for a blank value — the actual production bug", () => {
  // .env.example ships AI_DAILY_SPEND_CAP_CENTS as a bare `KEY=` line. Copied verbatim, that's
  // process.env.AI_DAILY_SPEND_CAP_CENTS === "", not undefined — `?? 200` doesn't catch this,
  // and Number("") is 0, not NaN, which silently became a real $0 cap that refused every call.
  assert.equal(parseOptionalCents("", 200), 200);
});

test("falls back to the default for a whitespace-only value", () => {
  assert.equal(parseOptionalCents("   ", 200), 200);
});

test("uses the real value when one is set", () => {
  assert.equal(parseOptionalCents("500", 200), 500);
});

test("respects an explicit zero — pausing spend on purpose is different from a blank var", () => {
  assert.equal(parseOptionalCents("0", 200), 0);
});

test("falls back to the default for non-numeric garbage instead of propagating NaN", () => {
  // A NaN cap would fail every comparison silently too (NaN < anything is always false) — the
  // same failure mode as the blank-string bug, just from a different kind of bad input.
  assert.equal(parseOptionalCents("not-a-number", 200), 200);
});

test("parseSwitch: unset or blank falls back to the default", () => {
  assert.equal(parseSwitch("X", undefined, false), false);
  assert.equal(parseSwitch("X", "", false), false);
  assert.equal(parseSwitch("X", "  ", true), true);
});

test("parseSwitch: on and off are read case-insensitively", () => {
  assert.equal(parseSwitch("X", "on", false), true);
  assert.equal(parseSwitch("X", "OFF", true), false);
  assert.equal(parseSwitch("X", " On ", false), true);
});

test("parseSwitch: anything else throws at startup instead of guessing a kill switch's state", () => {
  assert.throws(() => parseSwitch("COMMUNITY_CORRECTIONS", "true", false), /COMMUNITY_CORRECTIONS must be "on" or "off"/);
  assert.throws(() => parseSwitch("COMMUNITY_CORRECTIONS", "0", false));
});
