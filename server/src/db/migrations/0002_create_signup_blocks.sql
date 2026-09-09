-- Retry prevention for the age gate (docs/coppa.md §2.1): once a signup with a given email
-- fails the 18+ check, an immediate second attempt with a different date of birth is refused,
-- regardless of what that second date is. Rows are treated as expired after 24h (checked at
-- read time) so a genuine typo by an actual adult isn't a permanent lockout.

CREATE TABLE signup_blocks (
  email       TEXT PRIMARY KEY,
  blocked_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
