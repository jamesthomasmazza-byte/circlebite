import { pool } from "../pool.js";

// Test-only (2026-11-07). judgeSeed.test.ts and auth/judgeLink.test.ts both run the judge seed, which
// deletes and recreates every account on the seed domain, and node runs test files in parallel. Each
// holds this session-level advisory lock for its whole run, so the two take turns instead of
// deleting each other's rows mid-test. Nothing in the app takes it.

const SEED_DOMAIN_LOCK = 0x5eed;

/** Waits for the seed domain, then holds it until the returned release is called. */
export async function holdSeedDomain(): Promise<() => Promise<void>> {
  const client = await pool.connect();
  await client.query("SELECT pg_advisory_lock($1)", [SEED_DOMAIN_LOCK]);
  return async () => {
    try {
      await client.query("SELECT pg_advisory_unlock($1)", [SEED_DOMAIN_LOCK]);
    } finally {
      client.release();
    }
  };
}
