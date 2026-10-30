import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { afterEach, test } from "node:test";

import { combineLabelScan, createLabelScan, createScan } from "./api";
import { CLIENT_TIMING_HEADER, countDecodes, timingHeaders } from "./scanTiming";

// The phone's numbers for one scan (2026-10-30, "Faster scans" step 0), in a header on the scan
// request it was already making. The server keeps only these keys (server lib/scanTiming.ts).

const SCANNER = readFileSync(new URL("../BarcodeScanner.tsx", import.meta.url), "utf8");
const SCAN = readFileSync(new URL("../routes/Scan.tsx", import.meta.url), "utf8");

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

/** Catch the request's headers instead of sending it. */
function captureHeaders(): { headers: Record<string, string> } {
  const seen = { headers: {} as Record<string, string> };
  globalThis.fetch = (async (_url: string, init?: RequestInit) => {
    seen.headers = { ...(init?.headers as Record<string, string>) };
    return new Response("{}", { status: 200 });
  }) as typeof fetch;
  return seen;
}

test("the header: whole numbers, the keys given, nothing when there's nothing to send", () => {
  assert.deepEqual(timingHeaders({ cam: 412.4, decode: 1180.6 }), { "X-CB-Timing": "cam=412;decode=1181" });
  assert.deepEqual(timingHeaders({ downscale: 95, orig: 3145728 }), { "X-CB-Timing": "downscale=95;orig=3145728" });
  assert.deepEqual(timingHeaders({}), {});
  assert.deepEqual(timingHeaders(undefined), {});
  assert.deepEqual(timingHeaders({ cam: Number.NaN, decode: -1 }), {});
  assert.equal(CLIENT_TIMING_HEADER, "X-CB-Timing");
});

test("a barcode scan sends it alongside Content-Type, not instead of it", async () => {
  const seen = captureHeaders();
  await createScan("profile", "5000159484695", { cam: 400, decode: 900 });
  assert.deepEqual(seen.headers, { "Content-Type": "application/json", "X-CB-Timing": "cam=400;decode=900" });

  await createScan("profile", "5000159484695");
  assert.deepEqual(seen.headers, { "Content-Type": "application/json" }, "a typed barcode has no camera numbers");
});

test("a label photo sends it too, both ways in, and no Content-Type of its own (the form sets it)", async () => {
  const photo = new File(["x"], "label.jpg", { type: "image/jpeg" });
  const seen = captureHeaders();
  await createLabelScan("profile", photo, undefined, { downscale: 95, orig: 3145728 });
  assert.deepEqual(seen.headers, { "X-CB-Timing": "downscale=95;orig=3145728" });
  await combineLabelScan("scan", photo, { downscale: 80, orig: 2000000 });
  assert.deepEqual(seen.headers, { "X-CB-Timing": "downscale=80;orig=2000000" });
});

test("the scanner times the tap to the camera's first frame, then that to the read", () => {
  assert.match(SCANNER, /async function startCamera\(\) \{\n {4}requestedAtRef\.current = performance\.now\(\);/);
  // The first frame, from its own effect: startCamera itself adds no listener (BarcodeScanner.test.ts).
  assert.match(
    SCANNER,
    /useEffect\(\(\) => \{\n {4}const video = videoRef\.current;\n {4}if \(!cameraActive \|\| !video\) return;\n {4}runningAtRef\.current = null;[\s\S]*?video\.addEventListener\("playing", playing\);\n {4}return \(\) => video\.removeEventListener\("playing", playing\);/,
  );
  assert.match(SCANNER, /if \(running === null\) return \{\};[\s\S]*?cam: Math\.round\(running - requestedAtRef\.current\),\n {6}decode: msSince\(running\),/);
  assert.match(SCANNER, /const timing = cameraTiming\(\);[\s\S]*?onDetectedRef\.current\(text, timing\);/);
});

test("Scan passes the camera's numbers to the barcode scan, and times the photo's shrinking", () => {
  assert.match(SCAN, /onDetected=\{\(text, timing\) => \{\s*setBarcode\(text\);\s*void runScan\(text, profileId, timing\);/);
  assert.match(SCAN, /createScan\(targetProfileId, rawBarcode\.trim\(\), timing\)/);
  assert.match(SCAN, /const timing: ClientTiming = \{ downscale: msSince\(downscaleStart\), orig: photoFile\.size \};/);
  assert.match(SCAN, /combineLabelScan\(result\.id, downscaled, timing\)/);
  assert.match(SCAN, /createLabelScan\(profileId, downscaled, undefined, timing\)/);
});

// Ahead of B (2026-10-30): what the decoder did between the first frame and the read.

test("each try is counted and timed, and what it returns or throws is passed through untouched", () => {
  const notFound = new Error("NotFoundException");
  const read = { text: "5000159484695" };
  let calls = 0;
  const reader = {
    decodeFromCanvas(_canvas: HTMLCanvasElement): unknown {
      calls += 1;
      const until = performance.now() + 5;
      while (performance.now() < until) {
        // a try that takes about 5 ms
      }
      if (calls < 3) throw notFound;
      return read;
    },
  };
  const count = countDecodes(reader);
  const canvas = {} as HTMLCanvasElement;
  assert.throws(() => reader.decodeFromCanvas(canvas), (err) => err === notFound);
  assert.throws(() => reader.decodeFromCanvas(canvas), (err) => err === notFound);
  assert.equal(reader.decodeFromCanvas(canvas), read);
  assert.equal(count.attempts, 3, "the read itself counts as a try");
  assert.ok(count.ms >= 15 && count.ms < 200, `${count.ms}`);
});

test("the scanner counts every reader's tries, and sends tries, ms each, the picture's size and the region", () => {
  assert.match(SCANNER, /: new BrowserMultiFormatReader\(\);\n {6}decodesRef\.current = countDecodes\(reader\);\n {6}const controls = await reader\.decodeFromVideoDevice\(/);
  assert.match(SCANNER, /\.\.\.\(attempts > 0 && \{ attempts, each: Math\.round\(ms \/ attempts\) \}\),/);
  assert.match(SCANNER, /\.\.\.\(video && video\.videoWidth > 0 && \{ w: video\.videoWidth, h: video\.videoHeight \}\),/);
  assert.match(SCANNER, /region: region \? 1 : 0,/);
  assert.deepEqual(
    timingHeaders({ cam: 330, decode: 3182, attempts: 7, each: 38, w: 640, h: 480, region: 1 }),
    { "X-CB-Timing": "cam=330;decode=3182;attempts=7;each=38;w=640;h=480;region=1" },
  );
});
