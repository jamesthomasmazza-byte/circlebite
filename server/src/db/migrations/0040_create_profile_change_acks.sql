-- Which history entries a profile owner has seen — Prof. Yoest's second Oct 1 condition: "notify
-- the owner whenever a co-manager downgrades a verdict. The owner should never learn about a
-- change to their child's profile by accident." The owner's dashboard shows a banner for every
-- entry someone else made that has no ack from them, until they acknowledge it.
--
-- One row per (entry, user) the owner acknowledged — NOT a "seen everything up to time T" cursor.
-- A cursor can skip an entry: created_at is when the row was written, not when its transaction
-- committed, so a change that commits after the owner's cursor has moved past its timestamp would
-- never be shown. Acknowledging the ids actually put in front of the owner can't skip anything.
--
-- Separate from profile_changes so the history itself never needs an UPDATE (migration 0039).
-- Not in any parent's write path: nothing here runs when an allergen or report is saved.
--
-- Both FKs CASCADE: an ack means nothing without its entry or its user, and acks go with the
-- profile (via the entry) when it is deleted.

CREATE TABLE profile_change_acks (
  change_id  UUID NOT NULL REFERENCES profile_changes(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  acked_at   TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (change_id, user_id)
);

CREATE INDEX profile_change_acks_user_idx ON profile_change_acks(user_id);
