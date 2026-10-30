import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import { formatSummary, percentile, summarizeTimings } from "./scanTimingSummary.js";
import { scanTimingLine } from "./scanTiming.js";

// The p50/p90 summary of the journal's [timing] lines ("Faster scans" step 0).

test("nearest-rank percentiles", () => {
  const ten = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  assert.equal(percentile(ten, 50), 5);
  assert.equal(percentile(ten, 90), 9);
  assert.equal(percentile([7], 50), 7);
  assert.equal(percentile([7], 90), 7);
});

test("per path and per field, from the journal as journalctl prints it; everything else skipped", () => {
  const journal = [
    "Oct 30 09:02:11 ip-10-0-0-1 node[1234]: CircleBite API listening on port 3000",
    ...[100, 200, 300, 400, 500, 600, 700, 800, 900, 1000].map(
      (total, i) => `Oct 30 09:0${i}:00 ip-10-0-0-1 node[1234]: ` + scanTimingLine({ path: "A", totalMs: total, lookupMs: total / 10, client: i < 4 ? { cam: 400 + i, decode: 900 } : {} }),
    ),
    scanTimingLine({ path: "C", totalMs: 4200, receiveMs: 600, extractMs: 2900, reasonMs: 1100, imageBytes: 410000, tokensIn: 1900, tokensOut: 300, client: {} }),
    "[timing] {not json",
    '[timing] {"path":"Z","total_ms":5}',
    '[verdict] AI step failed { reason: "no_api_key", path: "C", step: "label_reading" }',
  ].join("\n");

  const [a, c, ...rest] = summarizeTimings(journal);
  assert.equal(rest.length, 0, "no B or D lines, no row for them; the bad lines dropped");

  assert.equal(a.path, "A");
  assert.equal(a.scans, 10);
  assert.deepEqual(a.fields, [
    { field: "total_ms", n: 10, p50: 500, p90: 900 },
    { field: "lookup_ms", n: 10, p50: 50, p90: 90 },
    { field: "cam_ms", n: 4, p50: 401, p90: 403 },
    { field: "decode_ms", n: 4, p50: 900, p90: 900 },
  ]);

  assert.equal(c.scans, 1);
  assert.deepEqual(
    c.fields.map((f) => f.field),
    ["total_ms", "receive_ms", "extract_ms", "reason_ms", "image_bytes", "in_tokens", "out_tokens"],
  );

  const printed = formatSummary([a, c]);
  assert.match(printed, /^Path A \(barcode, no AI\): 10 scans\n/);
  assert.match(printed, /\n {2}total_ms +500 +900 +10\n/);
  assert.match(printed, /\n\nPath C \(label photo\): 1 scan\n/);
  assert.equal(formatSummary([]), "No [timing] lines found.\n");
});

test("the command reads stdin and prints the table", () => {
  const script = fileURLToPath(new URL("../scanTimings.ts", import.meta.url));
  const out = execFileSync(process.execPath, ["--import", "tsx", script], {
    input: scanTimingLine({ path: "B", totalMs: 1800, lookupMs: 60, reasonMs: 1500, tokensIn: 900, tokensOut: 120, client: {} }),
    encoding: "utf8",
  });
  assert.match(out, /^Path B \(barcode, AI reasoning\): 1 scan\n/);
  assert.match(out, /\n {2}reason_ms +1500 +1500 +1\n/);
});
