import assert from "node:assert/strict";
import { after, test } from "node:test";

import pg from "pg";

import { env } from "../env.js";
import { pool } from "./pool.js";

// Real Postgres, real dropped connection: an idle pooled backend is terminated from a second
// connection, the way a Postgres restart drops it. Without pool.ts's 'error' listener the pool's
// error event is an uncaught exception, which fails this file (and takes the server down in prod).
//
// Deliberately does NOT wait with once(pool, "error"): that attaches a listener of its own, which
// would swallow the crash and pass even with pool.ts's handler deleted. It waits for the handler's
// own log line instead.

after(async () => {
  await pool.end();
});

test("an idle pooled connection being killed is logged, not a crash, and the pool keeps working", async () => {
  assert.equal(pool.listenerCount("error"), 1, "pool.ts registers exactly one 'error' listener");

  const client = await pool.connect();
  const { rows } = await client.query<{ pid: number }>("SELECT pg_backend_pid() AS pid");
  const idlePid = rows[0]!.pid;
  client.release();

  const killer = new pg.Client({ connectionString: env.databaseUrl });
  await killer.connect();
  const originalConsoleError = console.error;
  let logged: unknown[] | undefined;
  const handlerRan = new Promise<void>((resolve) => {
    console.error = (...args: unknown[]) => {
      logged = args;
      resolve();
    };
  });
  try {
    await killer.query("SELECT pg_terminate_backend($1)", [idlePid]);
    await handlerRan;
  } finally {
    console.error = originalConsoleError;
    await killer.end();
  }
  assert.match(String(logged?.[0]), /idle connection lost/);
  assert.ok(!JSON.stringify(logged).includes(env.databaseUrl), "never logs the connection string");

  const { rows: next } = await pool.query<{ pid: number }>("SELECT pg_backend_pid() AS pid");
  assert.notEqual(next[0]!.pid, idlePid);
});
