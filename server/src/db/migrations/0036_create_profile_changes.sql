-- A profile's change history: every allergen added, edited or removed, readable by the profile's
-- managers in the app (Prof. Yoest's Oct 1 conditions, docs/approvals/2026-10-02-yoest-overrule-
-- conditions.md). Before this, a co-manager could delete an allergen outright — changing every
-- verdict for everyone in the circle — and leave no trace, while the gentler, reviewable downgrade
-- was fully recorded. docs/principles.md principle 4: anything that can change what a person is told
-- must be auditable.
--
-- WRITTEN BY THE DATABASE, NOT THE ROUTES. An AFTER trigger on allergens writes each entry from the
-- actual OLD/NEW row images, in the same transaction as the change: if the change commits, its
-- entry commits; if it rolls back, there is no entry. Every write path is covered — today's routes,
-- routes added later, the seed, and a psql session on the box. A route that "forgets to log" can't
-- exist. An UPDATE that changes none of the four recorded columns writes nothing, so a no-op save
-- can't produce a false "edited".
--
-- The cost, accepted deliberately (JT, Oct 6): a trigger error rolls back the parent's edit. So the
-- trigger is built to be as close to unable to fail as the schema allows, and there is no EXCEPTION
-- WHEN OTHERS swallowing — that would let a change commit with no entry, which is the one outcome
-- this table exists to rule out.
--   * actor_id is a plain uuid with NO foreign key: a user that doesn't exist (or no longer does)
--     can't fail the insert, and account deletion never has to update these rows.
--   * The actor comes from a transaction-local setting, circlebite.actor_id (set by withActor in
--     server/src/lib/withActor.ts). It's cast to uuid only if it is one; anything else — unset,
--     empty, garbage — records actor NULL. Never guessed.
--   * NOT NULL only where the trigger controls the value. before/after are jsonb_build_object over
--     the raw columns and accept any text. No CHECK on snapshot data.
--   * allergen_profile_id keeps its FK (ON DELETE CASCADE — real deletion with the profile, docs/
--     coppa.md §2.6). It can't fail: allergens' own FK guarantees the profile exists on INSERT and
--     UPDATE, and on DELETE the trigger skips when the profile itself is being deleted.
-- If a trigger does fail in production: docs/server-setup.md §18.3 disables it in one command.
--
-- DEPLOY WINDOW — read this before treating an actor-NULL row as suspicious. scripts/release.sh
-- runs migrations BEFORE the symlink swap, so for a few seconds this trigger is live against the
-- previous release, which never sets circlebite.actor_id. An allergen edit in that window is
-- recorded with actor NULL and shows as "made outside the app". The same happens after a
-- symlink-only revert (release.sh's printed "Revert:" line), which leaves this migration in place.
-- Both are correct — the app genuinely didn't say who — and self-heal on the next request served
-- by new code. Rows like that around a deploy timestamp are this, not tampering.
--
-- actor_name is a snapshot of users.display_name (never email — R9), and it is deliberately KEPT
-- when that user later deletes their account: it's the owner's record of who changed their child's
-- profile. A narrow, documented exception to "deletion is real deletion" — see docs/coppa.md §2.6.

CREATE TABLE profile_changes (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  allergen_profile_id  UUID NOT NULL REFERENCES allergen_profiles(id) ON DELETE CASCADE,
  -- clock_timestamp(), not now(): now() is the transaction's start time, so every entry written in
  -- one transaction (the judge seed's allergens, a future route changing two at once) would share a
  -- timestamp and the history would shuffle between page loads. clock_timestamp() is when this row
  -- was written. It has microsecond resolution and follows the wall clock, so it alone isn't a total
  -- order: seq breaks ties, and within one transaction it is strictly in the order the changes
  -- happened. Every read orders by (created_at, seq).
  --
  -- GAPS IN seq ARE NORMAL and do not mean an entry was deleted. It comes from a sequence, and a
  -- change that rolls back (a duplicate allergen name, a failed request) has already consumed its
  -- number; Postgres can also skip numbers after a crash. Whether anything was removed from this
  -- append-only table is answered by the guard on it (migration 0039), never by counting seq.
  created_at           TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  seq                  BIGINT GENERATED ALWAYS AS IDENTITY,
  -- Named, not inline-anonymous, so later migrations that add a kind (downgrades, profile edits)
  -- replace this exact constraint in one ALTER rather than guessing Postgres's generated name or
  -- stacking a second CHECK. A kind the triggers write but this rejects would fail the trigger and
  -- roll back the parent's edit — profileChanges.test.ts checks the two agree.
  kind                 TEXT NOT NULL CONSTRAINT profile_changes_kind_check
                         CHECK (kind IN ('allergen_added', 'allergen_edited', 'allergen_removed')),
  actor_id             UUID,
  actor_name           TEXT,
  -- 'owner' | 'co_manager' at the moment of the change; NULL when there is no known actor or the
  -- actor held neither role (an admin in psql). Not a CHECK: computed by the trigger.
  actor_role           TEXT,
  -- No FK: the allergen row is gone after a removal, which is exactly when this matters.
  allergen_id          UUID,
  before               JSONB,
  after                JSONB
);

CREATE INDEX profile_changes_profile_created_idx ON profile_changes(allergen_profile_id, created_at DESC, seq DESC);

-- The acting user for this transaction, or NULL. current_setting(..., true) returns NULL when the
-- setting was never defined and '' once a SET LOCAL from an earlier transaction has lapsed; the
-- regex makes both, and anything else that isn't a uuid, NULL instead of a cast error.
CREATE FUNCTION profile_changes_current_actor() RETURNS UUID
LANGUAGE plpgsql STABLE AS $$
DECLARE
  raw TEXT := current_setting('circlebite.actor_id', true);
BEGIN
  IF raw ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RETURN raw::uuid;
  END IF;
  RETURN NULL;
END;
$$;

-- Appends one entry, resolving the actor's name and role as they are right now. Both lookups
-- return NULL for an actor that isn't a real user rather than raising.
CREATE FUNCTION profile_changes_append(
  p_profile_id UUID, p_kind TEXT, p_actor UUID, p_allergen_id UUID, p_before JSONB, p_after JSONB
) RETURNS VOID
LANGUAGE plpgsql AS $$
DECLARE
  v_name TEXT;
  v_role TEXT;
BEGIN
  IF p_actor IS NOT NULL THEN
    SELECT display_name INTO v_name FROM users WHERE id = p_actor;
    SELECT CASE
             WHEN p.manager_id = p_actor THEN 'owner'
             WHEN EXISTS (SELECT 1 FROM profile_managers pm
                          WHERE pm.allergen_profile_id = p.id AND pm.user_id = p_actor) THEN 'co_manager'
           END
      INTO v_role
      FROM allergen_profiles p WHERE p.id = p_profile_id;
  END IF;

  INSERT INTO profile_changes (allergen_profile_id, kind, actor_id, actor_name, actor_role, allergen_id, before, after)
  VALUES (p_profile_id, p_kind, p_actor, v_name, v_role, p_allergen_id, p_before, p_after);
END;
$$;

CREATE FUNCTION profile_changes_record_allergen() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM profile_changes_append(
      NEW.allergen_profile_id, 'allergen_added', profile_changes_current_actor(), NEW.id, NULL,
      jsonb_build_object('name', NEW.name, 'severity', NEW.severity, 'notes', NEW.notes,
                         'treat_traces_as_unsafe', NEW.treat_traces_as_unsafe));

  ELSIF TG_OP = 'UPDATE' THEN
    IF (OLD.name, OLD.severity, OLD.notes, OLD.treat_traces_as_unsafe)
       IS NOT DISTINCT FROM (NEW.name, NEW.severity, NEW.notes, NEW.treat_traces_as_unsafe) THEN
      RETURN NULL;
    END IF;
    PERFORM profile_changes_append(
      NEW.allergen_profile_id, 'allergen_edited', profile_changes_current_actor(), NEW.id,
      jsonb_build_object('name', OLD.name, 'severity', OLD.severity, 'notes', OLD.notes,
                         'treat_traces_as_unsafe', OLD.treat_traces_as_unsafe),
      jsonb_build_object('name', NEW.name, 'severity', NEW.severity, 'notes', NEW.notes,
                         'treat_traces_as_unsafe', NEW.treat_traces_as_unsafe));

  ELSE
    -- Deleting the whole profile cascades here after the profile row is already gone; its history
    -- is being deleted with it (coppa §2.6), so there is nothing to append to.
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

CREATE TRIGGER profile_changes_allergens
  AFTER INSERT OR UPDATE OR DELETE ON allergens
  FOR EACH ROW EXECUTE FUNCTION profile_changes_record_allergen();
