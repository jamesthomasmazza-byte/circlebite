// p50/p90 per path from a stretch of the journal's [timing] lines (lib/scanTiming.ts) — "Faster
// scans" step 0. Every other line is skipped, and so is any [timing] line that doesn't parse.

const FIELDS = [
  "total_ms",
  "receive_ms",
  "lookup_ms",
  "extract_ms",
  "reason_ms",
  "extract_attempts",
  "reason_attempts",
  "image_bytes",
  "in_tokens",
  "out_tokens",
  "cam_ms",
  "decode_ms",
  "downscale_ms",
  "orig_bytes",
] as const;

const PATHS = ["A", "B", "C", "D"] as const;

export type FieldSummary = { field: string; n: number; p50: number; p90: number };
export type PathSummary = { path: string; scans: number; fields: FieldSummary[] };

/** Nearest-rank percentile of sorted values: the value at or below which p% of them fall. */
export function percentile(sorted: number[], p: number): number {
  const rank = Math.max(1, Math.ceil((p / 100) * sorted.length));
  return sorted[rank - 1];
}

export function summarizeTimings(text: string): PathSummary[] {
  const byPath = new Map<string, Record<string, unknown>[]>();
  for (const line of text.split("\n")) {
    const at = line.indexOf("[timing] ");
    if (at < 0) continue;
    let fields: unknown;
    try {
      fields = JSON.parse(line.slice(at + "[timing] ".length));
    } catch {
      continue;
    }
    const path = (fields as { path?: unknown } | null)?.path;
    if (typeof path !== "string" || !(PATHS as readonly string[]).includes(path)) continue;
    byPath.set(path, [...(byPath.get(path) ?? []), fields as Record<string, unknown>]);
  }

  return PATHS.filter((path) => byPath.has(path)).map((path) => {
    const lines = byPath.get(path)!;
    const fields = FIELDS.flatMap((field) => {
      const values = lines
        .map((l) => l[field])
        .filter((v): v is number => typeof v === "number" && Number.isFinite(v))
        .sort((a, b) => a - b);
      return values.length === 0 ? [] : [{ field, n: values.length, p50: percentile(values, 50), p90: percentile(values, 90) }];
    });
    return { path, scans: lines.length, fields };
  });
}

const PATH_NAMES: Record<string, string> = {
  A: "barcode, no AI",
  B: "barcode, AI reasoning",
  C: "label photo",
  D: "label photo on a barcode scan",
};

export function formatSummary(summaries: PathSummary[]): string {
  if (summaries.length === 0) return "No [timing] lines found.\n";
  return summaries
    .map(({ path, scans, fields }) => {
      const rows = fields.map(
        ({ field, n, p50, p90 }) => `  ${field.padEnd(14)}${String(p50).padStart(10)}${String(p90).padStart(10)}${String(n).padStart(7)}`,
      );
      return [
        `Path ${path} (${PATH_NAMES[path]}): ${scans} scan${scans === 1 ? "" : "s"}`,
        `  ${"".padEnd(14)}${"p50".padStart(10)}${"p90".padStart(10)}${"n".padStart(7)}`,
        ...rows,
      ].join("\n");
    })
    .join("\n\n")
    .concat("\n");
}
