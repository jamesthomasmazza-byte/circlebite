// The phone's own numbers for one scan (2026-10-30, "Faster scans" step 0), sent in a header on the
// scan request it was already making. The server logs them with its own (server
// lib/scanTiming.ts) and keeps only these four keys, as whole numbers. Durations and sizes only
// (docs/principles.md, principle 5).

export type ClientTiming = {
  /** From the camera tap to the camera running. */
  cam?: number;
  /** From the camera running to the first read. */
  decode?: number;
  /** Shrinking the label photo before upload. */
  downscale?: number;
  /** The label photo's size before shrinking, in bytes. */
  orig?: number;
};

export const CLIENT_TIMING_HEADER = "X-CB-Timing";

/** "cam=412;decode=1180", or no header at all when there's nothing to send. */
export function timingHeaders(timing: ClientTiming | undefined): Record<string, string> {
  const pairs = Object.entries(timing ?? {})
    .filter(([, value]) => typeof value === "number" && Number.isFinite(value) && value >= 0)
    .map(([key, value]) => `${key}=${Math.round(value)}`);
  return pairs.length > 0 ? { [CLIENT_TIMING_HEADER]: pairs.join(";") } : {};
}

/** Whole milliseconds since a performance.now() reading. */
export function msSince(start: number): number {
  return Math.round(performance.now() - start);
}
