import { pool } from "../db/pool.js";
import { env } from "../env.js";

/**
 * In-app defense-in-depth spend rail, on top of (not instead of) the console-side cap set on the
 * sandbox AI_API_KEY itself — that cap is an account setting on the Anthropic console, not
 * something this repo can configure. Sums cost_cents already spent today (UTC) across
 * verdict_explanations and compares against env.aiDailySpendCapCents; reasonVerdict.ts checks
 * this before every AI call and skips the request entirely once the cap is reached.
 */
export async function underDailySpendCap(): Promise<boolean> {
  const { rows } = await pool.query<{ total: string | null }>(
    `SELECT SUM(cost_cents) AS total
     FROM verdict_explanations
     WHERE created_at >= date_trunc('day', now() AT TIME ZONE 'utc') AT TIME ZONE 'utc'`,
  );
  const spentCents = Number(rows[0]?.total ?? 0);
  return spentCents < env.aiDailySpendCapCents;
}
