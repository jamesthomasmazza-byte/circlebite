import pg from "pg";

import { env } from "../env.js";

export const pool = new pg.Pool({
  connectionString: env.databaseUrl,
});

// An idle connection that drops — Postgres restarting, a network blip, an idle timeout — makes the
// pool emit 'error'. With no listener, Node treats that as an uncaught exception and the whole server
// goes down mid-request for everyone. pg-pool has already discarded the dead client by the time this
// fires and opens a fresh one on the next query, so logging is all there is to do. Never the
// connection string: it carries the database password.
//
// This covers IDLE connections only. A connection that drops while checked out emits on the client,
// not the pool — lib/withActor.ts handles that for its own checkouts; the other pool.connect()
// callers are a BACKLOG item.
pool.on("error", (err) => {
  console.error("postgres: idle connection lost, pool will reconnect", { code: (err as { code?: string }).code, message: err.message });
});
