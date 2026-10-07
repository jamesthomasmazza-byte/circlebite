import { pool } from "../db/pool.js";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type UnseenProfileChanges = {
  profileId: string;
  label: string;
  /** The owner's own profile, so the banner says "your profile" rather than "Me's profile". */
  isSelf: boolean;
  count: number;
  /** Display names of the people behind these entries, as recorded. Never email (R9). */
  actorNames: string[];
  /** Some entry has no acting user — made outside the app. */
  outsideApp: boolean;
  /** Some entry has an acting user whose name wasn't recorded. */
  unnamedActor: boolean;
  /** Some entry is a downgrade report — it changed only the reporter's view, not the profile. */
  hasDowngrade: boolean;
  /** Some entry changed the profile itself (its allergens, label or note). */
  hasProfileChange: boolean;
};

/**
 * For each profile this user currently owns: how many history entries someone else made that the
 * user hasn't acknowledged. "Someone else" includes a change with no known actor — something made
 * outside the app is exactly what an owner shouldn't find by accident.
 *
 * Ownership is read now, not at write time, so after an account-deletion transfer (deleteAccount.ts)
 * the new owner inherits the unacknowledged backlog. Co-managers get nothing here: Prof. Yoest's
 * condition is about the owner, and co-managers notifying each other is a BACKLOG item.
 */
export async function loadUnseenChanges(userId: string): Promise<UnseenProfileChanges[]> {
  const { rows } = await pool.query<UnseenProfileChanges>(
    `SELECT p.id AS "profileId", p.label, p.is_self AS "isSelf", count(*)::int AS count,
            coalesce(array_agg(DISTINCT c.actor_name ORDER BY c.actor_name)
                       FILTER (WHERE c.actor_id IS NOT NULL AND c.actor_name IS NOT NULL), '{}') AS "actorNames",
            bool_or(c.actor_id IS NULL) AS "outsideApp",
            bool_or(c.actor_id IS NOT NULL AND c.actor_name IS NULL) AS "unnamedActor",
            bool_or(c.kind = 'downgrade_reported') AS "hasDowngrade",
            bool_or(c.kind <> 'downgrade_reported') AS "hasProfileChange"
     FROM profile_changes c
     JOIN allergen_profiles p ON p.id = c.allergen_profile_id
     WHERE p.manager_id = $1
       AND c.actor_id IS DISTINCT FROM $1
       AND NOT EXISTS (SELECT 1 FROM profile_change_acks a WHERE a.change_id = c.id AND a.user_id = $1)
     GROUP BY p.id, p.label, p.is_self, p.created_at
     ORDER BY p.created_at`,
    [userId],
  );
  return rows;
}

/**
 * Records that this user has seen these entries — only ids that belong to this profile, so a stray
 * or forged id acknowledges nothing anywhere else. Authorization (owner only) is the caller's.
 * Returns how many new acks were recorded; repeating an ack is a no-op.
 */
export async function acknowledgeChanges(userId: string, profileId: string, changeIds: string[]): Promise<number> {
  // A malformed id can't name an entry, and must not become a uuid cast error (a 500) either.
  const ids = changeIds.filter((id) => UUID_PATTERN.test(id));
  if (ids.length === 0) return 0;
  const { rowCount } = await pool.query(
    `INSERT INTO profile_change_acks (change_id, user_id)
     SELECT c.id, $1 FROM profile_changes c
     WHERE c.allergen_profile_id = $2 AND c.id = ANY($3::uuid[])
     ON CONFLICT DO NOTHING`,
    [userId, profileId, ids],
  );
  return rowCount ?? 0;
}
