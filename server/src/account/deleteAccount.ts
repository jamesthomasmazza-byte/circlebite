import { pool } from "../db/pool.js";

/**
 * DELETE /account (docs/coppa.md §2.6), with one deliberate departure from a plain cascade: a
 * profile this user owns transfers to its longest-standing co-manager instead of being destroyed,
 * because destroying a profile out from under a second adult who relies on it was never actually
 * acceptable, even though the schema's CASCADE would happily do it. A solo-owned profile (no
 * co-manager) is still destroyed exactly as the cascade design intends.
 *
 * Runs as one transaction: the transfer UPDATEs must commit their effect before the final DELETE
 * FROM users, or the CASCADE on allergen_profiles.manager_id would destroy a profile this function
 * just decided to save.
 *
 * Everything else is the existing, already-decided cascade shape (see the migrations' own
 * comments): profile_managers/follow_relationships rows this user holds elsewhere CASCADE off their
 * own user_id and are unaffected here; scans/product_corrections this user only scanned/reported on
 * someone else's profile SET NULL the identity column and keep the row; sessions CASCADE, logging
 * them out everywhere.
 */
export async function deleteAccount(userId: string): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { rows: ownedProfiles } = await client.query<{ id: string }>(
      "SELECT id FROM allergen_profiles WHERE manager_id = $1",
      [userId],
    );

    for (const { id: profileId } of ownedProfiles) {
      const { rows: candidates } = await client.query<{ user_id: string }>(
        "SELECT user_id FROM profile_managers WHERE allergen_profile_id = $1 ORDER BY added_at ASC LIMIT 1",
        [profileId],
      );
      const newOwnerId = candidates[0]?.user_id;
      if (!newOwnerId) continue; // no co-manager — the later DELETE FROM users cascade destroys it

      await client.query("UPDATE allergen_profiles SET manager_id = $1 WHERE id = $2", [newOwnerId, profileId]);
      await client.query("DELETE FROM profile_managers WHERE allergen_profile_id = $1 AND user_id = $2", [
        profileId,
        newOwnerId,
      ]);
    }

    await client.query("DELETE FROM users WHERE id = $1", [userId]);

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
