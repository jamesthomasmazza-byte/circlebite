-- Co-managers: full edit rights on a profile, granted via manager_invites (next migration).
-- added_by is audit-only and SET NULL on delete, not CASCADE — if the person who sent the invite
-- later deletes their own account, the invitee's own access must not disappear as a side effect
-- of someone else's account deletion.

CREATE TABLE profile_managers (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  allergen_profile_id   UUID NOT NULL REFERENCES allergen_profiles(id) ON DELETE CASCADE,
  user_id               UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  added_by              UUID REFERENCES users(id) ON DELETE SET NULL,
  added_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (allergen_profile_id, user_id)
);

CREATE INDEX profile_managers_user_id_idx ON profile_managers(user_id);
