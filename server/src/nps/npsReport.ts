import { pool } from "../db/pool.js";

/**
 * Below this many responses, a percentage is noise, not signal — same reasoning as
 * aiAccuracyReport.ts's SMALL_SAMPLE_THRESHOLD, but its own constant since this is a different
 * metric on a different table. Below the threshold, callers get the raw promoter/passive/detractor
 * counts and a null npsScore; the caller decides how to render that.
 */
export const NPS_SMALL_SAMPLE_THRESHOLD = 20;

export type NpsCategory = "promoter" | "passive" | "detractor";

export type NpsReport = {
  threshold: number;
  n: number;
  promoters: number;
  passives: number;
  detractors: number;
  /**
   * The −100…+100 NPS index: % promoters − % detractors. Named npsScore, not score, because this
   * API already has a per-response 0–10 score (server/src/nps/recordNpsResponse.ts) — the two are
   * different units and sharing a field name across them is a mix-up waiting to happen.
   */
  npsScore: number | null;
  reasons: string[];
};

type NpsResponseFields = { score: number; reason: string | null };

export function classify(score: number): NpsCategory {
  if (score >= 9) return "promoter";
  if (score >= 7) return "passive";
  return "detractor";
}

/**
 * Pure aggregation over raw response rows — kept separate from the SQL fetch so the
 * classification/threshold logic is testable with plain fixtures, same pattern as
 * aiAccuracyReport.ts's aggregateEscalations.
 */
export function aggregateNpsResponses(
  rows: NpsResponseFields[],
): Omit<NpsReport, "threshold"> {
  let promoters = 0;
  let passives = 0;
  let detractors = 0;
  const reasons: string[] = [];

  for (const row of rows) {
    const category = classify(row.score);
    if (category === "promoter") promoters += 1;
    else if (category === "passive") passives += 1;
    else detractors += 1;

    const trimmed = row.reason?.trim();
    if (trimmed) reasons.push(trimmed);
  }

  const n = rows.length;
  const npsScore =
    n < NPS_SMALL_SAMPLE_THRESHOLD ? null : Math.round(((promoters - detractors) / n) * 100);

  return { n, promoters, passives, detractors, npsScore, reasons };
}

/**
 * `includeSeeded: false` excludes the judge seed script's invented rows (source = 'seed') — useful
 * once real responses exist and the actual number is wanted on its own. Defaults to including them
 * so the admin page isn't empty during judging.
 */
export async function fetchNpsRows(includeSeeded = true): Promise<NpsResponseFields[]> {
  const { rows } = await pool.query<NpsResponseFields>(
    includeSeeded
      ? "SELECT score, reason FROM nps_responses ORDER BY created_at DESC"
      : "SELECT score, reason FROM nps_responses WHERE source = 'user' ORDER BY created_at DESC",
  );
  return rows;
}

export async function npsReport(includeSeeded = true): Promise<NpsReport> {
  const rows = await fetchNpsRows(includeSeeded);
  return { threshold: NPS_SMALL_SAMPLE_THRESHOLD, ...aggregateNpsResponses(rows) };
}
