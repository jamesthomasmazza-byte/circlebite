-- Deferred from 0003_create_sessions.sql, which could not reference allergen_profiles before it
-- existed. SET NULL, not CASCADE: deleting the acting profile should just clear the UX hint, not
-- destroy or log out the session itself.

ALTER TABLE sessions
  ADD CONSTRAINT sessions_acting_profile_id_fkey
  FOREIGN KEY (acting_profile_id) REFERENCES allergen_profiles(id) ON DELETE SET NULL;
