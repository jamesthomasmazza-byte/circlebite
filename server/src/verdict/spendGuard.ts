import { pool } from "../db/pool.js";
import { env } from "../env.js";

/**
 * In-app defense-in-depth spend rail, on top of (not instead of) the console-side cap set on the
 * sandbox AI_API_KEY itself — that cap is an account setting on the Anthropic console, not
 * something this repo can configure. Sums cost_cents already spent today (UTC) across BOTH
 * verdict_explanations (Path B/C reasoning calls) and label_extractions (Path C extraction calls)
 * — both spend against the same Anthropic key, so the cap has to reflect total spend, not just one
 * call type. reasonVerdict.ts and extractLabel.ts each check this before their own AI call and skip
 * the request entirely once the cap is reached.
 */
export async function underDailySpendCap(): Promise<boolean> {
  const { rows } = await pool.query<{ total: string | null }>(
    `SELECT
       (SELECT COALESCE(SUM(cost_cents), 0) FROM verdict_explanations
        WHERE created_at >= date_trunc('day', now() AT TIME ZONE 'utc') AT TIME ZONE 'utc')
       +
       (SELECT COALESCE(SUM(cost_cents), 0) FROM label_extractions
        WHERE created_at >= date_trunc('day', now() AT TIME ZONE 'utc') AT TIME ZONE 'utc')
       AS total`,
  );
  const spentCents = Number(rows[0]?.total ?? 0);
  return spentCents < env.aiDailySpendCapCents;
}
