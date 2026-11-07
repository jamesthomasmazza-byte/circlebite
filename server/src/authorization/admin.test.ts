import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import { pool } from "../db/pool.js";
import { holdSeedDomain } from "../db/seed/seedDomainLock.js";
import { HttpError } from "../lib/httpError.js";
import { SEED_EMAIL_DOMAIN } from "../lib/seedMarker.js";
import { assertIsAdmin, isAdminAccount } from "./admin.js";

const ADMIN = "cccccccc-0000-0000-0000-000000000001";
const NON_ADMIN = "cccccccc-0000-0000-0000-000000000002";
const UNKNOWN = "cccccccc-0000-0000-0000-000000000099";

before(async () => {
  await pool.query(
    `INSERT INTO users (id, email, password_hash, display_name, age_attested_adult, age_attested_at, is_admin) VALUES
       ($1, 'admin-test-a@example.com', 'x', 'A', true, now(), true),
       ($2, 'admin-test-b@example.com', 'x', 'B', true, now(), false)`,
    [ADMIN, NON_ADMIN],
  );
});

after(async () => {
  await pool.query("DELETE FROM users WHERE id = ANY($1)", [[ADMIN, NON_ADMIN]]);
  await pool.end();
});

test("resolves for an admin user", async () => {
  await assert.doesNotReject(() => assertIsAdmin(ADMIN));
});

test("throws a 404, not a 403, for a non-admin user", async () => {
  await assert.rejects(
    () => assertIsAdmin(NON_ADMIN),
    (err: unknown) => err instanceof HttpError && err.status === 404,
  );
});

test("throws a 404 for a user id that doesn't exist", async () => {
  await assert.rejects(
    () => assertIsAdmin(UNKNOWN),
    (err: unknown) => err instanceof HttpError && err.status === 404,
  );
});

// The judge seed's reserved domain (2026-11-07): never an admin, even with is_admin set by hand.

test("isAdminAccount: is_admin on a real address only, never on the seed domain", () => {
  assert.equal(isAdminAccount({ is_admin: true, email: "ops@example.com" }), true);
  assert.equal(isAdminAccount({ is_admin: false, email: "ops@example.com" }), false);
  assert.equal(isAdminAccount({ is_admin: true, email: `pool.judge5@${SEED_EMAIL_DOMAIN}` }), false);
  assert.equal(isAdminAccount({ is_admin: true, email: `judge1@${SEED_EMAIL_DOMAIN}` }), false);
});

test("throws a 404 for a seed-domain account even with is_admin set", async () => {
  // The seed tests delete every seed-domain account; this one waits its turn (seedDomainLock.ts).
  const release = await holdSeedDomain();
  const SEEDED_ADMIN = "cccccccc-0000-0000-0000-000000000003";
  try {
    await pool.query(
      `INSERT INTO users (id, email, password_hash, display_name, age_attested_adult, age_attested_at, is_admin)
       VALUES ($1, $2, 'x', 'S', true, now(), true)`,
      [SEEDED_ADMIN, `admin-test-seeded@${SEED_EMAIL_DOMAIN}`],
    );
    await assert.rejects(
      () => assertIsAdmin(SEEDED_ADMIN),
      (err: unknown) => err instanceof HttpError && err.status === 404,
    );
  } finally {
    await pool.query("DELETE FROM users WHERE id = $1", [SEEDED_ADMIN]);
    await release();
  }
});
