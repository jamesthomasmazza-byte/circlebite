import type { PoolClient } from "pg";

import { pool } from "../db/pool.js";

/**
 * Runs `fn` in one transaction that tells the database who is acting, so the profile change
 * history's triggers (migrations 0036–0038) can attribute what they record. The history is written
 * by the database whether or not this is used; a write outside it is still recorded, just with no
 * actor ("made outside the app"). Use it for every write a person makes to a profile or its
 * allergens.
 *
 * set_config(..., true) is transaction-local: it lapses at COMMIT/ROLLBACK, so a pooled connection
 * can't carry one request's actor into the next.
 *
 * Failure path: the original error is always the one rethrown — a ROLLBACK that fails too (a
 * dropped connection, the usual reason to be here) must not replace the reason the request failed.
 * And a connection that couldn't even roll back is destroyed (release(err)) instead of returned to
 * the pool for the next request to inherit. One that rolled back cleanly is healthy and goes back:
 * an ordinary SQL error like a duplicate allergen name shouldn't cost a connection.
 *
 * pg-pool removes its own 'error' listener while a client is checked out, so a connection that
 * drops mid-request emits an 'error' nobody is listening for — an uncaught exception that takes the
 * whole server down. This listener covers the checkout and also marks the connection broken. It is
 * left attached on a destroyed client, whose socket can still emit as it closes.
 */
export async function withActor<T>(userId: string, fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  let brokenConnection: Error | undefined;
  const onConnectionError = (err: Error) => {
    brokenConnection ??= err;
  };
  client.on("error", onConnectionError);
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('circlebite.actor_id', $1, true)", [userId]);
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch (rollbackErr) {
      brokenConnection = rollbackErr instanceof Error ? rollbackErr : new Error(String(rollbackErr));
    }
    throw err;
  } finally {
    if (brokenConnection) {
      client.release(brokenConnection);
    } else {
      client.removeListener("error", onConnectionError);
      client.release();
    }
  }
}
