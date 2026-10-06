-- Profile-level edits in the change history: the label, the profile note, and the default for
-- treating traces as unsafe (PATCH /profiles/:id, owner or co-manager). The note is where "carries
-- an EpiPen" or "anaphylaxis — call 911 first" lives; a co-manager clearing it was as unrecorded as
-- deleting an allergen (JT, Oct 6). Same rules and accepted risk as migration 0036, reusing its
-- profile_changes_append and profile_changes_current_actor.
--
-- Only those three columns are compared, so an UPDATE that moves nothing else — updated_at, or
-- manager_id when deleteAccount transfers ownership to a co-manager — writes nothing. An ownership
-- transfer is not a change to what the profile says about the child, and recording it here would
-- attribute it to whoever's actor setting happened to be live.
--
-- No INSERT or DELETE entry: a new profile's allergens record themselves, and a deleted profile
-- takes its history with it (coppa §2.6).
--
-- Kind constraint replaced in one ALTER under the same name, as in 0037.

ALTER TABLE profile_changes
  DROP CONSTRAINT profile_changes_kind_check,
  ADD CONSTRAINT profile_changes_kind_check
    CHECK (kind IN ('allergen_added', 'allergen_edited', 'allergen_removed', 'downgrade_reported', 'profile_edited'));

CREATE FUNCTION profile_changes_record_profile() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  IF (OLD.label, OLD.notes, OLD.default_treat_traces_as_unsafe)
     IS NOT DISTINCT FROM (NEW.label, NEW.notes, NEW.default_treat_traces_as_unsafe) THEN
    RETURN NULL;
  END IF;
  PERFORM profile_changes_append(
    NEW.id, 'profile_edited', profile_changes_current_actor(), NULL,
    jsonb_build_object('label', OLD.label, 'notes', OLD.notes,
                       'default_treat_traces_as_unsafe', OLD.default_treat_traces_as_unsafe),
    jsonb_build_object('label', NEW.label, 'notes', NEW.notes,
                       'default_treat_traces_as_unsafe', NEW.default_treat_traces_as_unsafe));
  RETURN NULL;
END;
$$;

CREATE TRIGGER profile_changes_profiles
  AFTER UPDATE ON allergen_profiles
  FOR EACH ROW EXECUTE FUNCTION profile_changes_record_profile();
