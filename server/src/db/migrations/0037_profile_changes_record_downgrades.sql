-- Downgrades in the profile change history — Prof. Yoest's first Oct 1 condition: "log every
-- downgrade: who made it, when, and what evidence they gave." product_corrections already held all
-- of that, but nowhere a parent could read it, and its only link to the profile is scan_id, which
-- goes NULL when the scan is deleted (migration 0020 — retention, the judge seed reset). So the
-- entry snapshots what a parent needs to read it later at write time (the N17 precedent), and is
-- reachable without the scan.
--
-- A downgrade is a remove_caution report (flag_wrong, wrong_product) — only owners and co-managers
-- can file one (routes/corrections.ts). It does NOT change the profile: it changes what the
-- reporter sees for that one scan (corrections/userScanView.ts). The entry records the report, not
-- a profile change, and the copy that renders it says so.
--
-- Same trigger rules as migration 0036, and the same accepted risk — this trigger sits in the path
-- of a parent filing a downgrade:
--   * The actor is NEW.reported_by, not the session setting: the report row already says who.
--   * correction_id has no FK. Corrections aren't deleted by the app, but a constraint the trigger
--     doesn't control is one it can trip. The entry's current status is a LEFT JOIN at read time.
--   * If the scan can't be found (scan_id NULL, or already gone), there is no profile to attach the
--     entry to: the trigger writes nothing and the report goes through. Today every insert comes
--     from recordCorrection.ts with a live scan, so this branch is for a path that doesn't exist yet
--     — and a missing history entry is better than a parent unable to file the report at all.
--   * All snapshot columns are nullable TEXT/TIMESTAMPTZ with no CHECK.
--
-- The kind constraint is replaced in one ALTER — dropped and re-added under the same name — so the
-- table never has zero or two CHECKs on kind, and the new kind is admitted in the same transaction
-- that creates the trigger that writes it.

ALTER TABLE profile_changes
  DROP CONSTRAINT profile_changes_kind_check,
  ADD CONSTRAINT profile_changes_kind_check
    CHECK (kind IN ('allergen_added', 'allergen_edited', 'allergen_removed', 'downgrade_reported')),
  ADD COLUMN correction_id      UUID,
  ADD COLUMN correction_type    TEXT,
  ADD COLUMN allergen           TEXT,
  ADD COLUMN product_name       TEXT,
  ADD COLUMN product_brand      TEXT,
  ADD COLUMN verdict_at_report  TEXT,
  ADD COLUMN note               TEXT,
  ADD COLUMN photo_path         TEXT,
  ADD COLUMN scan_created_at    TIMESTAMPTZ;

CREATE FUNCTION profile_changes_record_downgrade() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
DECLARE
  v_scan RECORD;
  v_name TEXT;
  v_role TEXT;
BEGIN
  SELECT allergen_profile_id, product_name, product_brand, created_at
    INTO v_scan FROM scans WHERE id = NEW.scan_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  -- Same name/role resolution as profile_changes_append (migration 0036): NULL, never an error,
  -- for a reporter who isn't a user.
  IF NEW.reported_by IS NOT NULL THEN
    SELECT display_name INTO v_name FROM users WHERE id = NEW.reported_by;
    SELECT CASE
             WHEN p.manager_id = NEW.reported_by THEN 'owner'
             WHEN EXISTS (SELECT 1 FROM profile_managers pm
                          WHERE pm.allergen_profile_id = p.id AND pm.user_id = NEW.reported_by) THEN 'co_manager'
           END
      INTO v_role
      FROM allergen_profiles p WHERE p.id = v_scan.allergen_profile_id;
  END IF;

  INSERT INTO profile_changes
    (allergen_profile_id, kind, actor_id, actor_name, actor_role,
     correction_id, correction_type, allergen, product_name, product_brand,
     verdict_at_report, note, photo_path, scan_created_at)
  VALUES
    (v_scan.allergen_profile_id, 'downgrade_reported', NEW.reported_by, v_name, v_role,
     NEW.id, NEW.correction_type, NEW.allergen, v_scan.product_name, v_scan.product_brand,
     NEW.verdict_at_report, NEW.note, NEW.photo_path, v_scan.created_at);
  RETURN NULL;
END;
$$;

CREATE TRIGGER profile_changes_downgrades
  AFTER INSERT ON product_corrections
  FOR EACH ROW WHEN (NEW.direction = 'remove_caution')
  EXECUTE FUNCTION profile_changes_record_downgrade();
