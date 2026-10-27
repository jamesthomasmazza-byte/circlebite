-- Follow requests are rate limited through the same auth_attempts table as sign-in (rateLimit.ts):
-- hashed keys, pruned after 24 hours. Keyed by the requester's own account email, never the address
-- they typed (migration 0047).

ALTER TABLE auth_attempts DROP CONSTRAINT auth_attempts_endpoint_check;
ALTER TABLE auth_attempts ADD CONSTRAINT auth_attempts_endpoint_check
  CHECK (endpoint IN ('login', 'register', 'change_password', 'password_reset', 'circle_request'));
