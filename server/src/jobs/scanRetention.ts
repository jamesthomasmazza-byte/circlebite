import { pool } from "../db/pool.js";

// docs/coppa.md §2.7: scan history older than this is purged automatically, and the purge itself
// must be provable, not just claimed — see retention_runs (migration 0019).
export const RETENTION_MONTHS = 24;

// A hung DELETE must eventually error and get recorded, not block this job (and the process behind
// it) forever — see the "what happens if it silently stops" reasoning in the account-deletion plan.
const STATEMENT_TIMEOUT_MS = 30_000;

export type RetentionRunResult = {
  status: "ok" | "error";
  rowsDeleted: number | null;
  errorMessage: string | null;
};

/**
 * Purges scans older than RETENTION_MONTHS and records the outcome in retention_runs, success or
 * failure alike — a gap in that table means the process was down, a status = 'error' row means the
 * job ran and failed, and that distinction is the whole point of the audit trail. verdict_
 * explanations cascades off the deleted scans as always; product_corrections no longer does
 * (migration 0020) — a correction is evidence about the product, not the scan.
 */
export async function runScanRetentionPurge(): Promise<RetentionRunResult> {
  const startedAt = new Date();
  let status: "ok" | "error" = "ok";
  let rowsDeleted: number | null = null;
  let errorMessage: string | null = null;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`SET LOCAL statement_timeout = ${STATEMENT_TIMEOUT_MS}`);
    const result = await client.query(
      "DELETE FROM scans WHERE created_at < now() - make_interval(months => $1)",
      [RETENTION_MONTHS],
    );
    rowsDeleted = result.rowCount ?? 0;
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    status = "error";
    errorMessage = err instanceof Error ? err.message : String(err);
  } finally {
    client.release();
  }

  const finishedAt = new Date();
  // Deliberately a separate query against the pool, not the same client/transaction as the delete
  // above — the audit row must land even when the delete itself rolled back.
  await pool.query(
    `INSERT INTO retention_runs (job_name, started_at, finished_at, rows_deleted, status, error_message)
     VALUES ('scan_retention', $1, $2, $3, $4, $5)`,
    [startedAt, finishedAt, rowsDeleted, status, errorMessage],
  );

  return { status, rowsDeleted, errorMessage };
}
