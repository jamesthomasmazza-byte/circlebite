-- Follow requests (BACKLOG "Plan to judging" item 6, 2026-10-27), behind CIRCLE_REQUESTS. Someone
-- asks to follow by typing the email address of a parent they already know; the request goes to
-- that adult's account, never to a profile. The owner picks which of their own profiles, and the
-- share level, when they approve. Follow only: co-managers still come by invite link alone
-- (CONTEST_RULES.md §3a).
--
-- Deliberately minimal (docs/principles.md principle 5, docs/coppa.md): who asked, whom, and when.
-- No message field, so nothing about a child can be typed into it, and the address the requester
-- typed is never stored — only the account it matched. An approved request is deleted as the
-- follow is created (the follow_relationships row is the record); a declined one is kept 30 days,
-- so asking again is silently dropped, then purged (jobs/circleRequestRetention.ts). Both sides
-- cascade: deleting either account deletes its requests.

CREATE TABLE circle_requests (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  owner_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status        TEXT NOT NULL CHECK (status IN ('pending', 'declined')) DEFAULT 'pending',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  responded_at  TIMESTAMPTZ,
  CHECK (requester_id <> owner_id),
  CHECK ((status = 'pending') = (responded_at IS NULL))
);

-- One waiting request per pair: a repeat while one waits changes nothing.
CREATE UNIQUE INDEX circle_requests_one_waiting_idx ON circle_requests(requester_id, owner_id) WHERE status = 'pending';
CREATE INDEX circle_requests_owner_idx ON circle_requests(owner_id, status);
