-- Rate limiting for /auth/login and /auth/register (the gap noted in docs/journal.md). Postgres,
-- not in-memory: scripts/release.sh restarts the app on every deploy, which would silently reset
-- an in-memory counter mid-iteration.
--
-- ip_hash/email_hash are HMAC-SHA256 over the real value (server/src/auth/rateLimit.ts), not the
-- raw IP or email — docs/principles.md principle 5: the limiter only ever needs equality against
-- the same value again, never the value itself back.
--
-- No FK, no unique constraint: this is an append-only attempt log, self-pruned by the application
-- (rows older than 24h are deleted opportunistically on write) rather than by a scheduled job —
-- nothing here depends on a cron that could silently stop running.

CREATE TABLE auth_attempts (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  occurred_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  endpoint     TEXT NOT NULL CHECK (endpoint IN ('login', 'register')),
  ip_hash      TEXT NOT NULL,
  email_hash   TEXT NOT NULL
);

-- Serves both the per-IP and per-(IP, email) count queries.
CREATE INDEX auth_attempts_ip_idx ON auth_attempts(endpoint, ip_hash, occurred_at);
-- Serves the per-email-alone query (docs/journal.md: a lone per-email threshold would let anyone
-- lock out any account, including the judge account, from rotating IPs — this is the wider,
-- longer-window backstop for that case).
CREATE INDEX auth_attempts_email_idx ON auth_attempts(endpoint, email_hash, occurred_at);
-- Serves the opportunistic prune (DELETE ... WHERE occurred_at < ...).
CREATE INDEX auth_attempts_occurred_at_idx ON auth_attempts(occurred_at);
