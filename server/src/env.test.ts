import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { parseInstant, parseOptionalCents, parseSha256Hex, parseSwitch } from "./env.js";

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

// LABEL_SCAN (Path C's kill switch) reuses parseSwitch identically to COMMUNITY_CORRECTIONS — same
// three cases, just the other switch's name, confirming env.ts wired it through the same helper
// rather than a bespoke check.
test("parseSwitch: LABEL_SCAN unset or blank falls back to off", () => {
  assert.equal(parseSwitch("LABEL_SCAN", undefined, false), false);
  assert.equal(parseSwitch("LABEL_SCAN", "", false), false);
});

test("parseSwitch: LABEL_SCAN on/off read case-insensitively", () => {
  assert.equal(parseSwitch("LABEL_SCAN", "on", false), true);
  assert.equal(parseSwitch("LABEL_SCAN", "OFF", true), false);
});

test("parseSwitch: LABEL_SCAN anything else throws at startup", () => {
  assert.throws(() => parseSwitch("LABEL_SCAN", "yes", false), /LABEL_SCAN must be "on" or "off"/);
});

// SCANNER_REGION (2026-10-27): wired through parseSwitch with off as the default, so an unset
// variable is the whole-frame decoding that ran before it.
test("SCANNER_REGION goes through parseSwitch and defaults to off", () => {
  const source = readFileSync(new URL("./env.ts", import.meta.url), "utf8");
  assert.match(source, /scannerRegion: parseSwitch\("SCANNER_REGION", process\.env\.SCANNER_REGION, false\)/);
  assert.equal(parseSwitch("SCANNER_REGION", undefined, false), false);
  assert.throws(() => parseSwitch("SCANNER_REGION", "box", false), /SCANNER_REGION must be "on" or "off"/);
});

// CIRCLE_REQUESTS (2026-10-27): off unless switched on, like every other switch.
test("CIRCLE_REQUESTS goes through parseSwitch and defaults to off", () => {
  const source = readFileSync(new URL("./env.ts", import.meta.url), "utf8");
  assert.match(source, /circleRequests: parseSwitch\("CIRCLE_REQUESTS", process\.env\.CIRCLE_REQUESTS, false\)/);
});

// CIRCLE_REDESIGN (2026-11-06): off unless switched on; off is today's Circle tab.
test("CIRCLE_REDESIGN goes through parseSwitch and defaults to off", () => {
  const source = readFileSync(new URL("./env.ts", import.meta.url), "utf8");
  assert.match(source, /circleRedesign: parseSwitch\("CIRCLE_REDESIGN", process\.env\.CIRCLE_REDESIGN, false\)/);
});

// SCAN_REDESIGN (2026-11-06): off unless switched on; off is today's Scan.
test("SCAN_REDESIGN goes through parseSwitch and defaults to off", () => {
  const source = readFileSync(new URL("./env.ts", import.meta.url), "utf8");
  assert.match(source, /scanRedesign: parseSwitch\("SCAN_REDESIGN", process\.env\.SCAN_REDESIGN, false\)/);
});

// PROFILE_REDESIGN (2026-11-06): off unless switched on; off is today's Profile tab and page.
test("PROFILE_REDESIGN goes through parseSwitch and defaults to off", () => {
  const source = readFileSync(new URL("./env.ts", import.meta.url), "utf8");
  assert.match(source, /profileRedesign: parseSwitch\("PROFILE_REDESIGN", process\.env\.PROFILE_REDESIGN, false\)/);
});

// REGISTRATION (2026-11-06): closed unless switched on, so an unset variable can't reopen sign-up.
test("REGISTRATION goes through parseSwitch and defaults to off", () => {
  const source = readFileSync(new URL("./env.ts", import.meta.url), "utf8");
  assert.match(source, /registration: parseSwitch\("REGISTRATION", process\.env\.REGISTRATION, false\)/);
  assert.equal(parseSwitch("REGISTRATION", undefined, false), false);
  assert.equal(parseSwitch("REGISTRATION", "", false), false);
});

// JUDGE_LINK (2026-11-07): off unless switched on, like REGISTRATION; unset is off.
test("JUDGE_LINK goes through parseSwitch and defaults to off", () => {
  const source = readFileSync(new URL("./env.ts", import.meta.url), "utf8");
  assert.match(source, /judgeLink: parseSwitch\("JUDGE_LINK", process\.env\.JUDGE_LINK, false\)/);
});

test("JUDGE_LINK_EXPIRES defaults to midnight Eastern starting December 1, 2026, and refuses garbage", () => {
  const source = readFileSync(new URL("./env.ts", import.meta.url), "utf8");
  assert.match(source, /parseInstant\("JUDGE_LINK_EXPIRES", process\.env\.JUDGE_LINK_EXPIRES, "2026-12-01T00:00:00-05:00"\)/);
  assert.equal(parseInstant("X", undefined, "2026-12-01T00:00:00-05:00").toISOString(), "2026-12-01T05:00:00.000Z");
  assert.equal(parseInstant("X", " ", "2026-12-01T00:00:00-05:00").toISOString(), "2026-12-01T05:00:00.000Z");
  assert.equal(parseInstant("X", "2026-11-20T18:00:00-05:00", "2026-12-01T00:00:00-05:00").toISOString(), "2026-11-20T23:00:00.000Z");
  for (const bad of ["tomorrow", "2026-12-01", "never"]) {
    assert.throws(() => parseInstant("JUDGE_LINK_EXPIRES", bad, "2026-12-01T00:00:00-05:00"), /JUDGE_LINK_EXPIRES must be/, bad);
  }
});

test("JUDGE_LINK_TOKEN_HASH is a SHA-256 hex digest or unset; anything else refuses to boot", () => {
  assert.equal(parseSha256Hex("X", undefined), undefined);
  assert.equal(parseSha256Hex("X", ""), undefined);
  assert.equal(parseSha256Hex("X", "A".repeat(64)), "a".repeat(64));
  assert.throws(() => parseSha256Hex("JUDGE_LINK_TOKEN_HASH", "abc"), /64 hex characters/);
});

// GUIDED_SETUP (2026-10-27): off unless switched on.
test("GUIDED_SETUP goes through parseSwitch and defaults to off", () => {
  const source = readFileSync(new URL("./env.ts", import.meta.url), "utf8");
  assert.match(source, /guidedSetup: parseSwitch\("GUIDED_SETUP", process\.env\.GUIDED_SETUP, false\)/);
});
