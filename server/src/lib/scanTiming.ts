// One line per scan, so the slow part of a scan can be found before anything is changed to speed it
// up (2026-10-30, "Faster scans" step 0). It goes to `journalctl -u circlebite` like
// verdict/aiFailureLog.ts, as one line of JSON so a day of them can be summarized
// (src/scanTimings.ts).
//
// Durations and sizes only (docs/principles.md, principle 5): no image, no label or ingredient
// text, no barcode, no person, profile or scan id. The type below has nowhere to put one.

export type ScanPath = "A" | "B" | "C" | "D";

/** The phone's own numbers, sent with the scan request it was already making (X-CB-Timing). */
export const CLIENT_TIMING_HEADER = "x-cb-timing";
// attempts, each: the decoder's tries on a camera scan and the average whole ms each took; w, h: the
// camera picture's size; region: SCANNER_REGION on (1) or off (0) — added 2026-10-30, ahead of B.
export const CLIENT_TIMING_KEYS = ["cam", "decode", "downscale", "orig", "attempts", "each", "w", "h", "region"] as const;
export type ClientTimingKey = (typeof CLIENT_TIMING_KEYS)[number];
export type ClientTiming = Partial<Record<ClientTimingKey, number>>;

// Longer than any real header ("cam=12345;decode=123456;attempts=1234;each=123;w=1920;h=1080;region=1"
// is 70), and big enough for a 100 MB original or a camera left open for a day; anything past these
// is dropped.
const MAX_HEADER_LENGTH = 160;
const MAX_VALUE = 100_000_000;

/** Only the fixed keys, each a whole number from 0 to MAX_VALUE. Anything else is dropped. */
export function parseClientTiming(raw: unknown): ClientTiming {
  const timing: ClientTiming = {};
  if (typeof raw !== "string" || raw.length > MAX_HEADER_LENGTH) return timing;
  for (const pair of raw.split(";")) {
    const [key, value] = pair.split("=");
    if (!(CLIENT_TIMING_KEYS as readonly string[]).includes(key) || !/^\d{1,9}$/.test(value ?? "")) continue;
    const n = Number(value);
    if (n <= MAX_VALUE) timing[key as ClientTimingKey] = n;
  }
  return timing;
}

/** What the scan's own steps took. Filled in by runLabelScan and combineLabelScan when passed. */
export type StepTimings = {
  lookupMs?: number;
  extractMs?: number;
  reasonMs?: number;
  tokensIn?: number;
  tokensOut?: number;
  /** Requests each AI call sent, retries included (verdict/aiClient.ts). */
  extractAttempts?: number;
  reasonAttempts?: number;
};

export type ScanTiming = StepTimings & {
  path: ScanPath;
  totalMs: number;
  /** From the request arriving to the photo fully received (C and D). */
  receiveMs?: number;
  imageBytes?: number;
  client: ClientTiming;
};

/** Whole milliseconds since a performance.now() reading. */
export function msSince(start: number): number {
  return Math.round(performance.now() - start);
}

/** First in a scan route's chain, so total_ms and receive_ms count from the request arriving. */
export function markScanStart(_req: unknown, res: { locals: Record<string, unknown> }, next: () => void): void {
  res.locals.scanStart = performance.now();
  next();
}

/** Time an awaited step, in whole milliseconds. */
export async function timed<T>(step: () => Promise<T>): Promise<[T, number]> {
  const start = performance.now();
  const value = await step();
  return [value, Math.round(performance.now() - start)];
}

export function addTokens(timings: StepTimings, result: { tokensIn: number | null; tokensOut: number | null }): void {
  if (result.tokensIn !== null) timings.tokensIn = (timings.tokensIn ?? 0) + result.tokensIn;
  if (result.tokensOut !== null) timings.tokensOut = (timings.tokensOut ?? 0) + result.tokensOut;
}

export function scanTimingLine(t: ScanTiming): string {
  const fields: Record<string, string | number | undefined> = {
    path: t.path,
    total_ms: t.totalMs,
    receive_ms: t.receiveMs,
    lookup_ms: t.lookupMs,
    extract_ms: t.extractMs,
    reason_ms: t.reasonMs,
    extract_attempts: t.extractAttempts,
    reason_attempts: t.reasonAttempts,
    image_bytes: t.imageBytes,
    in_tokens: t.tokensIn,
    out_tokens: t.tokensOut,
    cam_ms: t.client.cam,
    decode_ms: t.client.decode,
    decode_attempts: t.client.attempts,
    decode_each_ms: t.client.each,
    video_w: t.client.w,
    video_h: t.client.h,
    region: t.client.region,
    downscale_ms: t.client.downscale,
    orig_bytes: t.client.orig,
  };
  // JSON.stringify leaves out the undefined ones: a step that didn't run has no field.
  return `[timing] ${JSON.stringify(fields)}`;
}

export function logScanTiming(t: ScanTiming): void {
  console.log(scanTimingLine(t));
}
