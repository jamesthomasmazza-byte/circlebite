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
  /** The decoder's tries before the read, the read included. */
  attempts?: number;
  /** The average whole ms each try took, decoding only (not zxing's wait between tries). */
  each?: number;
  /** The camera picture's width and height, as the browser delivered it. */
  w?: number;
  h?: number;
  /** SCANNER_REGION: 1 decoding inside the box, 0 the whole frame. */
  region?: number;
};

export const CLIENT_TIMING_HEADER = "X-CB-Timing";

/** "cam=412;decode=1180", or no header at all when there's nothing to send. */
export function timingHeaders(timing: ClientTiming | undefined): Record<string, string> {
  const pairs = Object.entries(timing ?? {})
    .filter(([, value]) => typeof value === "number" && Number.isFinite(value) && value >= 0)
    .map(([key, value]) => `${key}=${Math.round(value)}`);
  return pairs.length > 0 ? { [CLIENT_TIMING_HEADER]: pairs.join(";") } : {};
}

export type DecodeCount = { attempts: number; ms: number };

/**
 * Counts and times each of the camera decoder's tries. zxing's scan loop draws a frame, then calls
 * the reader's decodeFromCanvas once, with the plain reader and BoxRegionReader alike (which crops
 * the box inside it). So this times the decoding (and the crop), not the drawing or zxing's wait
 * between tries. What decodeFromCanvas returns or throws is unchanged.
 */
export function countDecodes(reader: { decodeFromCanvas: (canvas: HTMLCanvasElement) => unknown }): DecodeCount {
  const decode = reader.decodeFromCanvas.bind(reader);
  const count: DecodeCount = { attempts: 0, ms: 0 };
  reader.decodeFromCanvas = (canvas) => {
    const start = performance.now();
    try {
      return decode(canvas);
    } finally {
      count.attempts += 1;
      count.ms += performance.now() - start;
    }
  };
  return count;
}

/** Whole milliseconds since a performance.now() reading. */
export function msSince(start: number): number {
  return Math.round(performance.now() - start);
}
