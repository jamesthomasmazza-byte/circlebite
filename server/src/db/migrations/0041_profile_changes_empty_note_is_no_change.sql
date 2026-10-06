-- An empty note replacing no note (or the reverse) is not a change, and must not be recorded as one.
-- The profile page's Save sends notes as the trimmed textarea — "" when it's blank — so saving a
-- profile whose note is NULL, with nothing changed, wrote NULL -> "". Migrations 0036/0038 compared
-- with IS NOT DISTINCT FROM, which counts that as a difference, so a co-manager pressing Save
-- without touching anything put "Sam changed Maya's profile note" in front of the owner. The
-- history must not disagree with what happened, from either direction.
--
-- Fixed here, in the comparison, rather than in the one client that does it today: any writer can
-- send "" for "no note". Only the no-op test changes; when anything else does change, before and
-- after are still recorded verbatim, "" or NULL as stored.
--
-- CREATE OR REPLACE keeps the triggers bound to the same functions — nothing is dropped, so there
-- is no moment without a trigger.

CREATE OR REPLACE FUNCTION profile_changes_record_allergen() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM profile_changes_append(
      NEW.allergen_profile_id, 'allergen_added', profile_changes_current_actor(), NEW.id, NULL,
      jsonb_build_object('name', NEW.name, 'severity', NEW.severity, 'notes', NEW.notes,
                         'treat_traces_as_unsafe', NEW.treat_traces_as_unsafe));

  ELSIF TG_OP = 'UPDATE' THEN
    IF (OLD.name, OLD.severity, NULLIF(OLD.notes, ''), OLD.treat_traces_as_unsafe)
       IS NOT DISTINCT FROM (NEW.name, NEW.severity, NULLIF(NEW.notes, ''), NEW.treat_traces_as_unsafe) THEN
      RETURN NULL;
    END IF;
    PERFORM profile_changes_append(
      NEW.allergen_profile_id, 'allergen_edited', profile_changes_current_actor(), NEW.id,
      jsonb_build_object('name', OLD.name, 'severity', OLD.severity, 'notes', OLD.notes,
                         'treat_traces_as_unsafe', OLD.treat_traces_as_unsafe),
      jsonb_build_object('name', NEW.name, 'severity', NEW.severity, 'notes', NEW.notes,
                         'treat_traces_as_unsafe', NEW.treat_traces_as_unsafe));

  ELSE
    IF NOT EXISTS (SELECT 1 FROM allergen_profiles WHERE id = OLD.allergen_profile_id) THEN
      RETURN NULL;
    END IF;
    PERFORM profile_changes_append(
      OLD.allergen_profile_id, 'allergen_removed', profile_changes_current_actor(), OLD.id,
      jsonb_build_object('name', OLD.name, 'severity', OLD.severity, 'notes', OLD.notes,
                         'treat_traces_as_unsafe', OLD.treat_traces_as_unsafe),
      NULL);
  END IF;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION profile_changes_record_profile() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  IF (OLD.label, NULLIF(OLD.notes, ''), OLD.default_treat_traces_as_unsafe)
     IS NOT DISTINCT FROM (NEW.label, NULLIF(NEW.notes, ''), NEW.default_treat_traces_as_unsafe) THEN
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
