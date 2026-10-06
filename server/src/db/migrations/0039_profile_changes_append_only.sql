-- The change history can't be edited or deleted, by the app or by an ordinary SQL statement —
-- docs/principles.md principle 4 and its precedent: "the audit table has no UPDATE or DELETE policy
-- for anyone, including the admin, because the record must not be editable by the surface it
-- audits." Nothing in the app needs to change an entry: seen-state lives in its own table
-- (migration 0040), and actor_id has no FK, so account deletion never touches these rows.
--
-- One exception: a DELETE is allowed when the entry's profile no longer exists. That is exactly the
-- profile-deletion cascade (ON DELETE CASCADE from allergen_profiles, including deleteAccount's
-- cascade through users), which is required — the history holds the child's allergen data and is
-- really deleted with the profile (docs/coppa.md §2.6). By the time the cascade reaches these rows
-- the profile row is already gone; a direct DELETE of an entry for a live profile is refused.
--
-- What this does NOT do: stop the database owner. The circlebite role owns this table and can
-- DISABLE TRIGGER, as the §18.3 runbook does for the three writer triggers. That runbook never
-- touches this guard. The guard makes changing history a deliberate, visible act rather than one
-- UPDATE away; it isn't a defence against someone who already holds the database.
--
-- Gaps in seq are not evidence against this: see migration 0036.

CREATE FUNCTION profile_changes_refuse_change() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE'
     AND NOT EXISTS (SELECT 1 FROM allergen_profiles WHERE id = OLD.allergen_profile_id) THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'profile_changes is append-only (% refused)', TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$$;

CREATE TRIGGER profile_changes_append_only
  BEFORE UPDATE OR DELETE ON profile_changes
  FOR EACH ROW EXECUTE FUNCTION profile_changes_refuse_change();

-- TRUNCATE skips row triggers entirely, so it needs its own.
CREATE FUNCTION profile_changes_refuse_truncate() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'profile_changes is append-only (TRUNCATE refused)'
    USING ERRCODE = 'insufficient_privilege';
END;
$$;

CREATE TRIGGER profile_changes_no_truncate
  BEFORE TRUNCATE ON profile_changes
  FOR EACH STATEMENT EXECUTE FUNCTION profile_changes_refuse_truncate();
