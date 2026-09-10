import { pool } from "../db/pool.js";
import { HttpError } from "../lib/httpError.js";

export type ProfileAccess =
  | { level: "owner" }
  | { level: "co_manager" }
  | { level: "follower"; shareLevel: "all" | "severe_only" };

/**
 * The single source of truth for "what can this user do with this profile" — used both to
 * authorize a request and to shape its response (e.g. filtering allergens for a severe_only
 * follower), so the two can never independently drift out of sync. Fetches access, not
 * existence: a profile that exists but isn't visible to this user returns null, identical to a
 * profile that doesn't exist at all.
 */
export async function getProfileAccess(
  userId: string,
  profileId: string,
): Promise<ProfileAccess | null> {
  const { rows } = await pool.query<{ level: "owner" | "co_manager" | "follower"; share_level: string | null }>(
    `SELECT
       CASE
         WHEN p.manager_id = $2 THEN 'owner'
         WHEN pm.user_id IS NOT NULL THEN 'co_manager'
         ELSE 'follower'
       END AS level,
       f.share_level
     FROM allergen_profiles p
     LEFT JOIN profile_managers pm
       ON pm.allergen_profile_id = p.id AND pm.user_id = $2
     LEFT JOIN follow_relationships f
       ON f.allergen_profile_id = p.id AND f.follower_id = $2 AND f.status = 'accepted'
     WHERE p.id = $1
       AND (p.manager_id = $2 OR pm.user_id IS NOT NULL OR f.follower_id IS NOT NULL)`,
    [profileId, userId],
  );

  const row = rows[0];
  if (!row) return null;
  if (row.level === "owner") return { level: "owner" };
  if (row.level === "co_manager") return { level: "co_manager" };
  return { level: "follower", shareLevel: row.share_level as "all" | "severe_only" };
}

/** Owner, co-manager, or accepted follower. */
export async function assertCanReadProfile(userId: string, profileId: string): Promise<ProfileAccess> {
  const access = await getProfileAccess(userId, profileId);
  if (!access) throw new HttpError(404, "not_found");
  return access;
}

/** Owner or co-manager only — followers are read-only. */
export async function assertCanManageProfile(
  userId: string,
  profileId: string,
): Promise<"owner" | "co_manager"> {
  const access = await getProfileAccess(userId, profileId);
  if (!access || access.level === "follower") throw new HttpError(404, "not_found");
  return access.level;
}

/**
 * Owner only — stricter than assertCanManageProfile. A co-manager gets edit rights, not the
 * right to delete the profile or remove another manager (including the original owner).
 */
export async function assertIsProfileOwner(userId: string, profileId: string): Promise<void> {
  const { rows } = await pool.query(
    "SELECT 1 FROM allergen_profiles WHERE id = $1 AND manager_id = $2",
    [profileId, userId],
  );
  if (rows.length === 0) throw new HttpError(404, "not_found");
}
