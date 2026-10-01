import assert from "node:assert/strict";
import { after, test } from "node:test";

import { pool } from "../db/pool.js";
import { isSeedEmail, SEED_EMAIL_DOMAIN } from "../lib/seedMarker.js";
import { authRouter } from "./routes.js";

// Same no-HTTP-harness approach as routes/corrections.test.ts: invoke POST /register's handler
// directly with a fake req.

after(async () => {
  await pool.end();
});

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

test("signup refuses the judge seed's reserved domain, however it's cased or padded", async () => {
  // The seed deletes every account on this domain when it reseeds — a real person must never hold one.
  for (const email of [`someone@${SEED_EMAIL_DOMAIN}`, `  SomeOne@${SEED_EMAIL_DOMAIN.toUpperCase()}  `]) {
    // Built at run time rather than written as a literal: long enough to pass the length rule, so
    // the domain is the only reason left to refuse — and nothing credential-shaped in the repo (R8).
    const password = "x".repeat(16);
    const { status, body } = await register({ email, password, displayName: "Someone", dob: "1990-01-01" });
    assert.equal(status, 400, email);
    assert.deepEqual(body, { error: "invalid_request" });
  }

  const { rows } = await pool.query("SELECT 1 FROM users WHERE email LIKE $1", [`%@${SEED_EMAIL_DOMAIN}`]);
  assert.equal(rows.length, 0, "nothing was created");
});
