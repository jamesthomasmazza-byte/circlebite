-- One row per allergen on a profile. severity is a CHECK constraint, not a native Postgres enum —
-- easier to extend later without migration gymnastics, at this project's scale.

CREATE TABLE allergens (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  allergen_profile_id     UUID NOT NULL REFERENCES allergen_profiles(id) ON DELETE CASCADE,
  name                    TEXT NOT NULL,
  severity                TEXT NOT NULL CHECK (severity IN ('mild', 'moderate', 'severe')),
  notes                   TEXT,
  treat_traces_as_unsafe  BOOLEAN NOT NULL,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX allergens_allergen_profile_id_idx ON allergens(allergen_profile_id);

-- Not in docs/legacy-spec.md, added here: prevents a duplicate "Peanut"/"peanut" row on the same
-- profile rather than discovering the gap during the verdict-matching work in weeks 6-7.
CREATE UNIQUE INDEX allergens_profile_name_idx ON allergens(allergen_profile_id, lower(name));
