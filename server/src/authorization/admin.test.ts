import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import { pool } from "../db/pool.js";
import { HttpError } from "../lib/httpError.js";
import { assertIsAdmin } from "./admin.js";

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
