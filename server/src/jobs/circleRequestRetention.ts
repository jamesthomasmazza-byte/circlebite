import { pool } from "../db/pool.js";
import { DECLINED_KEPT_DAYS } from "../routes/circleRequests.js";

/**
 * Purges declined follow requests once DECLINED_KEPT_DAYS have passed (migration 0047): kept only
 * so that asking again is silently dropped, then gone. Recorded in retention_runs like the scan
 * purge (scanRetention.ts), success or failure alike, under its own job name. Waiting requests are
 * never purged: a request stays until the owner acts on it.
 */
export async function runCircleRequestPurge(): Promise<{ status: "ok" | "error"; rowsDeleted: number | null }> {
  const startedAt = new Date();
  let status: "ok" | "error" = "ok";
  let rowsDeleted: number | null = null;
  let errorMessage: string | null = null;

  try {
    const result = await pool.query(
      "DELETE FROM circle_requests WHERE status = 'declined' AND responded_at < now() - make_interval(days => $1)",
      [DECLINED_KEPT_DAYS],
    );
    rowsDeleted = result.rowCount ?? 0;
  } catch (err) {
    status = "error";
    errorMessage = err instanceof Error ? err.message : String(err);
  }

  await pool.query(
    `INSERT INTO retention_runs (job_name, started_at, finished_at, rows_deleted, status, error_message)
     VALUES ('circle_request_retention', $1, $2, $3, $4, $5)`,
    [startedAt, new Date(), rowsDeleted, status, errorMessage],
  );
  return { status, rowsDeleted };
}
