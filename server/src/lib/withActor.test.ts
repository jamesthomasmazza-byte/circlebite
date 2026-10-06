import assert from "node:assert/strict";
import { after, test } from "node:test";

import { pool } from "../db/pool.js";
import { withActor } from "./withActor.js";

// Real Postgres. The broken-connection case is a real one: fn terminates its own backend, so the
// ROLLBACK in withActor's catch genuinely fails, the way it does when the network drops mid-request.

after(async () => {
  await pool.end();
});

test("the actor is visible inside the transaction and gone after it", async () => {
  const actor = "00000000-0000-4000-8000-0000000000aa";
  const inside = await withActor(actor, async (client) => {
    const { rows } = await client.query<{ v: string }>("SELECT current_setting('circlebite.actor_id', true) AS v");
    return rows[0]!.v;
  });
  assert.equal(inside, actor);

  // A pooled connection must not carry it into the next request.
  const client = await pool.connect();
  try {
    const { rows } = await client.query<{ v: string | null }>("SELECT current_setting('circlebite.actor_id', true) AS v");
    assert.ok(rows[0]!.v === null || rows[0]!.v === "", `leaked actor: ${rows[0]!.v}`);
  } finally {
    client.release();
  }
});

test("an ordinary SQL error is rethrown as itself, and the connection survives", async () => {
  const before = pool.totalCount;
  await assert.rejects(
    withActor("00000000-0000-4000-8000-0000000000aa", (client) => client.query("SELECT 1/0")),
    (err: { code?: string }) => err.code === "22012",
  );
  assert.equal(pool.totalCount, before, "a cleanly rolled-back connection goes back to the pool, not destroyed");
});

test("when the connection drops, the original error is rethrown — not the ROLLBACK's — and the connection is destroyed", async () => {
  let pid: number | undefined;
  await assert.rejects(
    withActor("00000000-0000-4000-8000-0000000000aa", async (client) => {
      const { rows } = await client.query<{ pid: number }>("SELECT pg_backend_pid() AS pid");
      pid = rows[0]!.pid;
      await client.query("SELECT pg_terminate_backend(pg_backend_pid())");
    }),
    (err: { code?: string; message?: string }) => {
      // 57P01 admin_shutdown — the termination itself, which is why the request failed.
      assert.equal(err.code, "57P01", `expected the original termination error, got ${err.code}: ${err.message}`);
      return true;
    },
  );

  // The pool still works, and nothing it hands out is the dead backend.
  for (let i = 0; i < 3; i++) {
    const { rows } = await pool.query<{ pid: number }>("SELECT pg_backend_pid() AS pid");
    assert.notEqual(rows[0]!.pid, pid);
  }
});
