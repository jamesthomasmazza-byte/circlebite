-- Audit trail for the 24-month scan-retention job (docs/coppa.md §2.7). There's no cron or systemd
-- timer on this box (docs/server-setup.md) — the job runs in-process, on a setInterval alongside
-- the app itself (server/src/jobs/scanRetention.ts). "The job actually runs" has to be provable, so
-- every run writes a row here, success or failure, not just on success — a gap in this table means
-- the process was down; a status = 'error' row means the job ran and failed. Checked by hand via
-- psql, same pattern as the other operational checks in docs/server-setup.md §11/§12.

CREATE TABLE retention_runs (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_name       TEXT NOT NULL DEFAULT 'scan_retention',
  started_at     TIMESTAMPTZ NOT NULL,
  finished_at    TIMESTAMPTZ NOT NULL,
  rows_deleted   INTEGER,
  status         TEXT NOT NULL CHECK (status IN ('ok', 'error')),
  error_message  TEXT
);

CREATE INDEX retention_runs_job_started_idx ON retention_runs(job_name, started_at DESC);
