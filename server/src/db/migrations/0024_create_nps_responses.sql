-- Self-initiated NPS feedback from Settings — never a modal; the scan path is a safety flow and
-- must not be interrupted by a survey.
--
-- user_id ON DELETE SET NULL: same precedent as product_corrections.reported_by (migration 0015)
-- — this is feedback about the product, not about the person who gave it, so it survives the
-- responding account being deleted.
--
-- Promoter/passive/detractor is derived at read time (server/src/nps/npsReport.ts), never stored.
--
-- The 90-day re-submission guard is enforced in application code (server/src/nps/
-- recordNpsResponse.ts), not a DB constraint — matching this table's rolling-window nature and the
-- precedent of leaning on app logic for invariants a static CHECK can't express (migration 0023's
-- rejection_reason requirement).
--
-- source distinguishes real responses from the judge seed script's invented rows. A NULL user_id
-- already happens for a real response whose account was later deleted, so user_id alone can't be
-- used to tell "real, now-anonymous" apart from "never real" — and the seed script's UUID-prefix
-- convention (server/src/db/seedJudgeNps.ts) is good enough for rerunnability but isn't something
-- the aggregate's metric integrity should depend on. npsReport()'s default view includes seed rows
-- (so the judging demo isn't empty); once real responses exist, fetchNpsRows() can be called with
-- includeSeeded: false to see the real number alone.

CREATE TABLE nps_responses (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID REFERENCES users(id) ON DELETE SET NULL,
  score      SMALLINT NOT NULL CHECK (score BETWEEN 0 AND 10),
  reason     TEXT,
  source     TEXT NOT NULL CHECK (source IN ('user', 'seed')) DEFAULT 'user',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Supports both the 90-day re-submission check and "does this user have a current response".
CREATE INDEX nps_responses_user_created_idx ON nps_responses(user_id, created_at DESC);
