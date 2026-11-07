import assert from "node:assert/strict";
import { after, test } from "node:test";

import { pool } from "../db/pool.js";
import { env } from "../env.js";
import { isSeedEmail, SEED_EMAIL_DOMAIN } from "../lib/seedMarker.js";
import { authRouter } from "./routes.js";

// Same no-HTTP-harness approach as routes/corrections.test.ts: invoke POST /register's handler
// directly with a fake req.

after(async () => {
  await pool.end();
});

// REGISTRATION (env.ts) is off by default, so every test that reaches past the switch turns it on
// for its own run and puts it back, as routes/circleRequests.test.ts does with its switch.
async function withRegistration<T>(on: boolean, run: () => Promise<T>): Promise<T> {
  const previous = env.registration;
  env.registration = on;
  try {
    return await run();
  } finally {
    env.registration = previous;
  }
}

function register(body: Record<string, unknown>): Promise<{ status: number; body: unknown }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const layer = (authRouter as any).stack.find((l: any) => l.route?.path === "/register" && l.route.methods.post);
  assert.ok(layer, "expected a registered POST /register route");
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
      cookie() {
        return res;
      },
    };
    handler({ body, ip: "203.0.113.7" }, res, (err: unknown) =>
      reject(err ?? new Error("handler called next() without responding")),
    );
  });
}

test("isSeedEmail matches the seed domain only, not a lookalike", () => {
  assert.equal(isSeedEmail(`judge@${SEED_EMAIL_DOMAIN}`), true);
  assert.equal(isSeedEmail(`judge@not-${SEED_EMAIL_DOMAIN}`), false);
  assert.equal(isSeedEmail(`judge@${SEED_EMAIL_DOMAIN}.example.com`), false);
  assert.equal(isSeedEmail("judge@example.com"), false);
});

test("signup refuses the judge seed's reserved domain, however it's cased or padded", () =>
  withRegistration(true, async () => {
    // The seed deletes every account on this domain when it reseeds — a real person must never hold one.
    for (const email of [`someone@${SEED_EMAIL_DOMAIN}`, `  SomeOne@${SEED_EMAIL_DOMAIN.toUpperCase()}  `]) {
      // Built at run time rather than written as a literal: long enough to pass the length rule, so
      // the domain is the only reason left to refuse — and nothing credential-shaped in the repo (R8).
      const password = "x".repeat(16);
      const { status, body } = await register({ email, password, displayName: "Someone", dob: "1990-01-01" });
      assert.equal(status, 400, email);
      assert.deepEqual(body, { error: "invalid_request" });
    }

    // The exact address tried, not the whole domain: the judge seed's own test creates seed-domain
    // accounts and may be running in parallel.
    const { rows } = await pool.query("SELECT 1 FROM users WHERE email = $1", [`someone@${SEED_EMAIL_DOMAIN}`]);
    assert.equal(rows.length, 0, "nothing was created");
  }));

// REGISTRATION off (Prof. Yoest, Nov 5, 2026): sign-up is closed until after judging. The refusal is
// the server's, so a hidden button, an old tab or a hand-made request all end here.

test("with REGISTRATION off, a valid sign-up is refused and nothing is created", () =>
  withRegistration(false, async () => {
    const email = `closed-${Date.now()}@example.com`;
    const password = "x".repeat(16);
    const { status, body } = await register({ email, password, displayName: "Someone", dob: "1990-01-01" });
    assert.equal(status, 403);
    assert.deepEqual(body, { error: "registration_closed" });
    const { rows } = await pool.query("SELECT 1 FROM users WHERE email = $1", [email]);
    assert.equal(rows.length, 0, "no account");
  }));

test("with REGISTRATION off, the refusal comes first: the same answer for any body, even none", () =>
  withRegistration(false, async () => {
    // Before validation and the age gate, so a closed sign-up can't be used to learn whether an
    // address is taken or blocked.
    for (const body of [undefined, {}, { email: "x" }, { email: `someone@${SEED_EMAIL_DOMAIN}`, password: "x", displayName: "", dob: "2020-01-01" }]) {
      const res = await register(body as Record<string, unknown>);
      assert.equal(res.status, 403);
      assert.deepEqual(res.body, { error: "registration_closed" });
    }
  }));

test("with REGISTRATION on, a valid adult sign-up creates the account, as before", () =>
  withRegistration(true, async () => {
    const email = `open-${Date.now()}@example.com`;
    try {
      const password = "x".repeat(16);
      const { status, body } = await register({ email, password, displayName: "Someone", dob: "1990-01-01" });
      assert.equal(status, 201);
      assert.equal((body as { email: string }).email, email);
      const { rows } = await pool.query<{ age_attested_adult: boolean }>(
        "SELECT age_attested_adult FROM users WHERE email = $1",
        [email],
      );
      assert.deepEqual(rows, [{ age_attested_adult: true }]);
    } finally {
      await pool.query("DELETE FROM users WHERE email = $1", [email]);
    }
  }));
