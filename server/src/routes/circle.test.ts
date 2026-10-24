import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";

import { pool } from "../db/pool.js";
import { circleRouter } from "./circle.js";

// GET /profiles/:id/circle — the Circle tab's data. Called through the router's own handler, as
// profiles.test.ts does, so the route's checks run as written.

type Captured = { status: number; body: unknown };

function get(path: string, params: Record<string, string>, userId: string): Promise<Captured> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const layer = (circleRouter as any).stack.find((l: any) => l.route?.path === path && l.route.methods.get);
  assert.ok(layer, `expected a registered GET ${path} route`);
  const handler = layer.route.stack.at(-1).handle;
  return new Promise((resolve, reject) => {
    let status = 200;
    const res = {
      status(code: number) {
        status = code;
        return res;
      },
      json(payload: unknown) {
        resolve({ status, body: payload });
      },
    };
    handler({ params, user: { id: userId } }, res, (err: unknown) => reject(err ?? new Error("next() without responding")));
  });
}

const OWNER = randomUUID();
const CO_MANAGER = randomUUID();
let profileId = "";

before(async () => {
  await pool.query(
    `INSERT INTO users (id, email, password_hash, display_name, age_attested_adult, age_attested_at)
     VALUES ($1, $3, 'x', 'Sam Owner', true, now()), ($2, $4, 'x', 'Co Judge', true, now())`,
    [OWNER, CO_MANAGER, `${OWNER}@example.test`, `${CO_MANAGER}@example.test`],
  );
  const { rows } = await pool.query<{ id: string }>(
    "INSERT INTO allergen_profiles (manager_id, label) VALUES ($1, 'Circle Test Child') RETURNING id",
    [OWNER],
  );
  profileId = rows[0]!.id;
  await pool.query("INSERT INTO profile_managers (allergen_profile_id, user_id) VALUES ($1, $2)", [profileId, CO_MANAGER]);
});

after(async () => {
  await pool.query("DELETE FROM users WHERE id = ANY($1)", [[OWNER, CO_MANAGER]]);
  await pool.end();
});

test("a co-manager sees whose circle it is: the owner, by display name and never by email", async () => {
  const { body } = await get("/profiles/:id/circle", { id: profileId }, CO_MANAGER);
  const circle = body as { owner: Record<string, unknown> | null; managers: { user_id: string }[] };
  assert.deepEqual(circle.owner, { user_id: OWNER, display_name: "Sam Owner" });
  assert.deepEqual(circle.managers.map((m) => m.user_id), [CO_MANAGER]);
});

test("the owner gets the same field, naming themselves", async () => {
  const { body } = await get("/profiles/:id/circle", { id: profileId }, OWNER);
  assert.equal((body as { owner: { user_id: string } }).owner.user_id, OWNER);
});
