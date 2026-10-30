import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { addTokens, parseClientTiming, scanTimingLine, timed, type StepTimings } from "./scanTiming.js";

// The timing line (2026-10-30, "Faster scans" step 0): durations and sizes only, never anything
// that says what was scanned or by whom (docs/principles.md, principle 5).

test("the phone's header: the fixed keys, whole numbers only", () => {
  assert.deepEqual(parseClientTiming("cam=412;decode=1180;downscale=95;orig=3145728"), {
    cam: 412,
    decode: 1180,
    downscale: 95,
    orig: 3145728,
  });
  assert.deepEqual(parseClientTiming("cam=412"), { cam: 412 });
  assert.deepEqual(parseClientTiming(undefined), {});
  assert.deepEqual(parseClientTiming(""), {});
});

test("anything else in the header is dropped: other keys, text, fractions, negatives, huge values", () => {
  assert.deepEqual(
    parseClientTiming("barcode=5000159484695;user=7e5c;cam=12.5;decode=-3;downscale=abc;orig=999999999"),
    {},
    "nothing but the four keys, and only whole numbers up to 100,000,000",
  );
  assert.deepEqual(parseClientTiming("cam=1;cam=2"), { cam: 2 });
  assert.deepEqual(parseClientTiming("cam=1;" + "x".repeat(200)), {}, "an over-long header is ignored whole");
  assert.deepEqual(parseClientTiming(["cam=1"]), {}, "a repeated header arrives as an array; ignored");
});

test("one line, JSON, numbers and the path letter only; a step that didn't run has no field", () => {
  const line = scanTimingLine({
    path: "C",
    totalMs: 4210,
    receiveMs: 640,
    lookupMs: 85,
    extractMs: 2900,
    reasonMs: 1100,
    imageBytes: 412000,
    tokensIn: 1900,
    tokensOut: 310,
    client: { downscale: 95, orig: 3145728 },
  });
  assert.ok(line.startsWith("[timing] "));
  assert.doesNotMatch(line, /\n/);
  const fields = JSON.parse(line.slice("[timing] ".length));
  assert.deepEqual(fields, {
    path: "C",
    total_ms: 4210,
    receive_ms: 640,
    lookup_ms: 85,
    extract_ms: 2900,
    reason_ms: 1100,
    image_bytes: 412000,
    in_tokens: 1900,
    out_tokens: 310,
    downscale_ms: 95,
    orig_bytes: 3145728,
  });

  const barcode = JSON.parse(scanTimingLine({ path: "A", totalMs: 120, lookupMs: 90, client: { cam: 400, decode: 900 } }).slice(9));
  assert.deepEqual(barcode, { path: "A", total_ms: 120, lookup_ms: 90, cam_ms: 400, decode_ms: 900 });
});

test("the line can't carry an identifier: every field but the path letter is a number", () => {
  const source = readFileSync(new URL("./scanTiming.ts", import.meta.url), "utf8");
  const type = source.slice(source.indexOf("export type StepTimings"), source.indexOf("/** Whole milliseconds"));
  const fields = [...type.matchAll(/^\s+(\w+)\??: ([^;]+);/gm)];
  assert.equal(fields.length, 10, "StepTimings' five and ScanTiming's own five");
  for (const [, field, fieldType] of fields) {
    if (field === "path") assert.equal(fieldType, "ScanPath");
    else if (field === "client") assert.equal(fieldType, "ClientTiming");
    else assert.equal(fieldType, "number", field);
  }
  assert.match(source, /export type ScanPath = "A" \| "B" \| "C" \| "D";/);
  assert.match(source, /export type ClientTiming = Partial<Record<ClientTimingKey, number>>;/);
});

test("timed() returns the value and whole milliseconds; tokens add up across both AI steps", async () => {
  const [value, ms] = await timed(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
    return "done";
  });
  assert.equal(value, "done");
  assert.ok(Number.isInteger(ms) && ms >= 15, `${ms}`);

  const timings: StepTimings = {};
  addTokens(timings, { tokensIn: 1500, tokensOut: 250 });
  addTokens(timings, { tokensIn: 400, tokensOut: 60 });
  addTokens(timings, { tokensIn: null, tokensOut: null });
  assert.deepEqual(timings, { tokensIn: 1900, tokensOut: 310 });
});

test("every scan path logs its line, after the response, with the phone's header", () => {
  const route = readFileSync(new URL("../routes/scans.ts", import.meta.url), "utf8");
  for (const path of ['"/scans",', '"/scans/label",']) {
    const i = route.indexOf(`scansRouter.post(\n  ${path}`);
    assert.ok(i >= 0, path);
    assert.match(route.slice(i, i + 80), /\n {2}markScanStart,\n {2}requireAuth,/, `${path} starts the clock first`);
  }
  assert.match(route, /res\.status\(201\)\.json\(\{[\s\S]*?\}\);\n {4}logScanTiming\(\{\n {6}path: isPathB \? "B" : "A",/);
  assert.match(route, /res\.status\(200\)\.json\(outcome\);\n {6}logTiming\("D"\);/);
  assert.match(route, /res\.status\(201\)\.json\(result\);\n {4}logTiming\("C"\);/);
  assert.equal(route.match(/client: parseClientTiming\(req\.get\(CLIENT_TIMING_HEADER\)\)/g)?.length, 2);
  assert.match(route, /res\.locals\.receiveMs = msSince\(res\.locals\.scanStart\);/);
});
