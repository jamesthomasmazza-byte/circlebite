-- Account holders. Accounts are 18+ only — see docs/coppa.md. Children exist only as
-- allergen profiles owned by an adult account (allergen_profiles, added in a later migration).

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE users (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email               TEXT NOT NULL UNIQUE,
  password_hash       TEXT NOT NULL,
  display_name        TEXT NOT NULL,

  -- Age gate result only — the raw date of birth is never stored (docs/coppa.md §2.1).
  age_attested_adult  BOOLEAN NOT NULL,
  age_attested_at     TIMESTAMPTZ NOT NULL,

  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
