import { pool } from "../db/pool.js";
import { findLongestStandingCoManager } from "./transferCandidate.js";

export type DeletionImpactProfile = {
  id: string;
  label: string;
  scanCount: number;
  outcome:
    | { type: "transfer"; newOwner: { displayName: string; email: string } }
    | { type: "destroy"; followerCount: number };
};

/**
 * Preview for the Settings confirmation screen (docs/coppa.md §2.6: "confirmed with a typed
 * confirmation, not just a button"). Uses the same longest-standing-co-manager rule deleteAccount()
 * acts on, so this can never promise something the actual delete doesn't do.
 */
export async function getDeletionImpact(userId: string): Promise<DeletionImpactProfile[]> {
  const { rows: profiles } = await pool.query<{ id: string; label: string }>(
    "SELECT id, label FROM allergen_profiles WHERE manager_id = $1 ORDER BY label",
    [userId],
  );

  const results: DeletionImpactProfile[] = [];
  for (const profile of profiles) {
    const { rows: scanCountRows } = await pool.query<{ count: string }>(
      "SELECT count(*) FROM scans WHERE allergen_profile_id = $1",
      [profile.id],
    );
    const scanCount = Number(scanCountRows[0]?.count ?? 0);

    const newOwnerId = await findLongestStandingCoManager(pool, profile.id);

    if (newOwnerId) {
      const { rows: ownerRows } = await pool.query<{ display_name: string; email: string }>(
        "SELECT display_name, email FROM users WHERE id = $1",
        [newOwnerId],
      );
      results.push({
        id: profile.id,
        label: profile.label,
        scanCount,
        outcome: {
          type: "transfer",
          newOwner: { displayName: ownerRows[0].display_name, email: ownerRows[0].email },
        },
      });
      continue;
    }

    const { rows: followerCountRows } = await pool.query<{ count: string }>(
      "SELECT count(*) FROM follow_relationships WHERE allergen_profile_id = $1 AND status = 'accepted'",
      [profile.id],
    );
    results.push({
      id: profile.id,
      label: profile.label,
      scanCount,
      outcome: { type: "destroy", followerCount: Number(followerCountRows[0]?.count ?? 0) },
    });
  }

  return results;
}
