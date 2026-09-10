-- Follow: view a profile and scan on its behalf, cannot edit. This one table is both the invite
-- and the grant (pending -> accepted -> revoked), matching docs/legacy-spec.md's own lifecycle,
-- rather than splitting into a separate invite table the way co-manager does.
--
-- follower_id is nullable: a link is generated before anyone specific has claimed it (same
-- anonymous single-use-link model as manager_invites), and gets filled in on accept.
--
-- invited_by is audit-only, SET NULL on delete — same reasoning as profile_managers.added_by: the
-- inviter's account being deleted later must not revoke the invitee's own, separate access.
--
-- token_hash: plain SHA-256, not HMAC. A leaked invite-tokens table alone shouldn't grant access —
-- only the full URL (sent out-of-band, never stored) does — and the 256-bit random token already
-- supplies all the entropy a keyed hash would add here.

CREATE TABLE follow_relationships (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  allergen_profile_id   UUID NOT NULL REFERENCES allergen_profiles(id) ON DELETE CASCADE,
  follower_id           UUID REFERENCES users(id) ON DELETE CASCADE,
  invited_by            UUID REFERENCES users(id) ON DELETE SET NULL,
  token_hash            TEXT NOT NULL UNIQUE,
  status                TEXT NOT NULL CHECK (status IN ('pending', 'accepted', 'revoked')) DEFAULT 'pending',
  share_level           TEXT NOT NULL CHECK (share_level IN ('all', 'severe_only')),
  message               TEXT,
  responded_at          TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Postgres treats NULLs as distinct, so this only actually constrains once follower_id is set —
  -- exactly the state (an accepted follow) where duplicate-follow actually matters.
  UNIQUE (follower_id, allergen_profile_id)
);

CREATE INDEX follow_relationships_profile_id_idx ON follow_relationships(allergen_profile_id);
CREATE INDEX follow_relationships_follower_id_idx ON follow_relationships(follower_id);
