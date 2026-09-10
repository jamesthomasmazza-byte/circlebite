-- Single-use co-manager invite links. accepted_at/accepted_by is a small improvement over
-- docs/legacy-spec.md's version: an invite's full lifecycle (created -> accepted or revoked) is
-- visible on this one row, instead of having to infer "used" from whether a profile_managers row
-- happens to exist.
--
-- created_by is audit-only, SET NULL on delete — same reasoning as the other invited_by/added_by
-- columns in this migration set.

CREATE TABLE manager_invites (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  allergen_profile_id   UUID NOT NULL REFERENCES allergen_profiles(id) ON DELETE CASCADE,
  token_hash            TEXT NOT NULL UNIQUE,
  created_by            UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at            TIMESTAMPTZ,
  accepted_at           TIMESTAMPTZ,
  accepted_by           UUID REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX manager_invites_profile_id_idx ON manager_invites(allergen_profile_id);
