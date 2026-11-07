import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";

import { pool } from "../db/pool.js";
import { scansRouter } from "./scans.js";

// GET /profiles/:id/scan-count (PROFILE_REDESIGN, 2026-11-06): the profile page's "<n> scans", from
// the same rows and the same check as the history, uncapped.

const OWNER = randomUUID();
const FOLLOWER = randomUUID();
const STRANGER = randomUUID();
let profileId = "";

function call(path: string, userId: string): Promise<{ status: number; body: unknown }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const layer = (scansRouter as any).stack.find((l: any) => l.route?.path === path && l.route.methods.get);
  assert.ok(layer, `expected a registered GET ${path}`);
  const handler = layer.route.stack.at(-1).handle;
  return new Promise((resolve, reject) => {
    let status = 200;
    const res = {
      status(code: number) {
        status = code;
        return res;
      },
      json(body: unknown) {
        resolve({ status, body });
      },
    };
    handler({ params: { id: profileId }, user: { id: userId } }, res, (err: unknown) => {
      const code = (err as { status?: number } | undefined)?.status;
      if (code) resolve({ status: code, body: null });
      else reject(err ?? new Error("next() without responding"));
    });
  });
}

before(async () => {
  await pool.query(
    `INSERT INTO users (id, email, password_hash, display_name, age_attested_adult, age_attested_at)
     VALUES ($1, $4, 'x', 'Owner', true, now()), ($2, $5, 'x', 'Follower', true, now()), ($3, $6, 'x', 'Stranger', true, now())`,
    [OWNER, FOLLOWER, STRANGER, `${OWNER}@example.test`, `${FOLLOWER}@example.test`, `${STRANGER}@example.test`],
  );
  const { rows } = await pool.query<{ id: string }>("INSERT INTO allergen_profiles (manager_id, label) VALUES ($1, 'Count Test') RETURNING id", [OWNER]);
  profileId = rows[0]!.id;
  await pool.query(
    `INSERT INTO follow_relationships (allergen_profile_id, follower_id, invited_by, token_hash, status, share_level, responded_at)
     VALUES ($1, $2, $3, $4, 'accepted', 'severe_only', now())`,
    [profileId, FOLLOWER, OWNER, `count-test-${randomUUID()}`],
  );
  for (let i = 0; i < 23; i++) {
    await pool.query(
      `INSERT INTO scans (allergen_profile_id, barcode, result, matched_allergens) VALUES ($1, $2, 'safe', '[]')`,
      [profileId, `29900000${String(i).padStart(5, "0")}`],
    );
  }
});

after(async () => {
  await pool.query("DELETE FROM allergen_profiles WHERE id = $1", [profileId]);
  await pool.query("DELETE FROM users WHERE id = ANY($1)", [[OWNER, FOLLOWER, STRANGER]]);
  await pool.end();
});

test("the count covers every scan the history does, past the history's newest 20", async () => {
  const history = await call("/profiles/:id/scans", OWNER);
  assert.equal((history.body as unknown[]).length, 20, "history is capped");
  assert.deepEqual((await call("/profiles/:id/scan-count", OWNER)).body, { count: 23 });
});

test("anyone who can read the profile gets the same count; a severe-only follower included", async () => {
  assert.deepEqual((await call("/profiles/:id/scan-count", FOLLOWER)).body, { count: 23 });
});

test("someone who can't read the profile gets 404, as for its history", async () => {
  assert.equal((await call("/profiles/:id/scan-count", STRANGER)).status, 404);
  assert.equal((await call("/profiles/:id/scans", STRANGER)).status, 404);
});
