-- Extends the endpoint whitelist so rateLimit.ts can key change-password and password-reset
-- attempts through the same auth_attempts table login/register already use, instead of a second
-- table (docs/principles.md principle 5 / minimum collection: reuse what already exists).

ALTER TABLE auth_attempts DROP CONSTRAINT auth_attempts_endpoint_check;
ALTER TABLE auth_attempts ADD CONSTRAINT auth_attempts_endpoint_check
  CHECK (endpoint IN ('login', 'register', 'change_password', 'password_reset'));
