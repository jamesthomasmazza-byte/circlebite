-- Judge worlds (Prof. Yoest, 2026-10-27, 7:55 PM; docs/approvals/2026-10-27-yoest-one-shared-barcode.md):
-- every judge scans the same barcode, and the separation is in the data — a report from a judge's
-- world counts only with reports from that same world, never across judges and never toward or
-- against a real user's claim (corrections/recordCorrection.ts, countCorroboratingFamilies).
--
-- users.judge_world: 1–4 for a judge and the invented people in that judge's circle; NULL for
-- everyone else, which is every real account. Only the judge seed writes it (db/seed/judgeSeed.ts):
-- signup's INSERT doesn't name it, and the only other writes to users change password_hash. The
-- CHECK is the floor under that: a world only on the seed's reserved domain, which signup refuses
-- (lib/seedMarker.ts), so no real account can hold one even through a future bug.

ALTER TABLE users
  ADD COLUMN judge_world SMALLINT CHECK (judge_world > 0),
  ADD CONSTRAINT users_judge_world_seed_only
    CHECK (judge_world IS NULL OR email LIKE '%@demo.circlebite.test');

-- product_corrections.judge_world_at_report: the world a report was filed in, snapshotted at write
-- time (the N17 precedent, like 0042's profile_owner_at_report). Not a join to users: a reseed
-- deletes the judge accounts, reported_by goes NULL, and a live join would drop the judge's reports
-- into the real world.
--
-- The reporter's world, else the world of the reported profile's owner: a real person invited into
-- a judge's circle files into that judge's world, and a judge filing on any profile files into their
-- own. Every existing row is NULL (real): nothing had a world before this migration.
--
-- Set by a trigger, never by the caller: recordCorrection, a re-file and the seed's own inserts get
-- it the same way, so a judge's own report from the app is marked without app code involved. The
-- trigger overwrites whatever the INSERT supplied, and a second one refuses any change afterwards.
--
-- Old code ignores the column and the trigger fills it for any INSERT the previous release makes, so
-- a symlink rollback past this migration still works (docs/server-setup.md §9).

ALTER TABLE product_corrections ADD COLUMN judge_world_at_report SMALLINT;

CREATE FUNCTION product_corrections_set_judge_world() RETURNS trigger AS $$
BEGIN
  NEW.judge_world_at_report := COALESCE(
    (SELECT judge_world FROM users WHERE id = NEW.reported_by),
    (SELECT judge_world FROM users WHERE id = NEW.profile_owner_at_report)
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER product_corrections_set_judge_world
  BEFORE INSERT ON product_corrections
  FOR EACH ROW EXECUTE FUNCTION product_corrections_set_judge_world();

CREATE FUNCTION product_corrections_keep_judge_world() RETURNS trigger AS $$
BEGIN
  IF NEW.judge_world_at_report IS DISTINCT FROM OLD.judge_world_at_report THEN
    RAISE EXCEPTION 'judge_world_at_report is fixed at insert';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER product_corrections_keep_judge_world
  BEFORE UPDATE OF judge_world_at_report ON product_corrections
  FOR EACH ROW EXECUTE FUNCTION product_corrections_keep_judge_world();
