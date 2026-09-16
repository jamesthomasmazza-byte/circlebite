import type { Pool, PoolClient } from "pg";

type Queryable = Pool | PoolClient;

/**
 * The one rule for who a profile transfers to, shared by deleteAccount() (which acts on it) and
 * deletionImpact() (which previews it) — kept in one place so the preview shown before confirming
 * can never disagree with what the delete actually does.
 */
export async function findLongestStandingCoManager(db: Queryable, profileId: string): Promise<string | null> {
  const { rows } = await db.query<{ user_id: string }>(
    "SELECT user_id FROM profile_managers WHERE allergen_profile_id = $1 ORDER BY added_at ASC LIMIT 1",
    [profileId],
  );
  return rows[0]?.user_id ?? null;
}
