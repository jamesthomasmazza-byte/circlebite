-- A person whose allergies are tracked. Not a user account — a parent has an account, each
-- child (or the parent themself) has an allergen_profiles row. manager_id is the owner; co-managers
-- live in profile_managers (migration 0006).

CREATE TABLE allergen_profiles (
  id                              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  manager_id                      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  label                           TEXT NOT NULL,
  is_self                         BOOLEAN NOT NULL DEFAULT false,
  notes                           TEXT,
  default_treat_traces_as_unsafe  BOOLEAN NOT NULL DEFAULT true,
  created_at                      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX allergen_profiles_manager_id_idx ON allergen_profiles(manager_id);
