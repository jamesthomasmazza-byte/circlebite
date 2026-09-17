-- One-time, admin-generated password reset tokens. This app sends no email at all (R6), so there
-- is no self-service "forgot password" trigger — JT generates a token by hand on the box
-- (docs/server-setup.md §15) and hands it to the account holder out of band, same pattern as
-- judge credentials.
--
-- token_hash: plain SHA-256 via lib/inviteToken.ts's hashInviteToken(), not HMAC — same reasoning
-- as manager_invites/follow_relationships: the raw token is 256 bits of its own entropy and never
-- stored, so a leaked table alone grants nothing.
--
-- expires_at: neither manager_invites nor follow_relationships has real time-based expiry to
-- copy — modeled on sessions.expires_at instead. See auth/passwordReset.ts for the TTL value.
--
-- used_at: single-use, same shape as manager_invites.accepted_at.
--
-- user_id ON DELETE CASCADE: if the account is deleted after a token was issued but before it's
-- used, the token row disappears with it — a lookup by hash then returns no row, identical to a
-- token that was never issued. Deliberate: it's what keeps "token for a deleted account" and
-- "token never existed" indistinguishable without any extra code.

CREATE TABLE password_reset_tokens (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash   TEXT NOT NULL UNIQUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at   TIMESTAMPTZ NOT NULL,
  used_at      TIMESTAMPTZ
);

CREATE INDEX password_reset_tokens_user_id_idx ON password_reset_tokens(user_id);
