-- DB-backed sessions, not JWTs: a compromised session must be revocable instantly
-- (docs/principles.md #4 — reversibility is a precondition on anything safety-critical),
-- which a stateless token can't do without a blocklist that's just this table by another name.

CREATE TABLE sessions (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- HMAC of the bearer token that lives in the cookie; the raw token is never stored, so a
  -- database read alone (backup, leaked snapshot) can't be used to impersonate a session.
  token_hash         TEXT NOT NULL UNIQUE,

  -- Last profile the picker had selected — a UX hint only, never trusted for authorization.
  -- No FK yet: allergen_profiles doesn't exist until the weeks 2-3 migrations, which add the
  -- constraint then. See docs/coppa.md §2.2 / docs/legacy-spec.md §2 on why this can't become
  -- a second, unchecked access-control path.
  acting_profile_id  UUID,

  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at         TIMESTAMPTZ NOT NULL,
  revoked_at         TIMESTAMPTZ
);

CREATE INDEX sessions_user_id_idx ON sessions(user_id);
