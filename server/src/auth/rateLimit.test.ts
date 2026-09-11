import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import { pool } from "../db/pool.js";
import { isRateLimited, recordAttempt } from "./rateLimit.js";

// A fresh, single-purpose table with no FK dependents — safe to wipe at the start and end of this
// file's run, same discipline as recordCorrection.test.ts's real-Postgres cleanup.
before(async () => {
  await pool.query("DELETE FROM auth_attempts");
});

after(async () => {
  await pool.query("DELETE FROM auth_attempts");
  await pool.end();
});

test("not rate limited with no recorded attempts", async () => {
  assert.equal(await isRateLimited("login", "1.1.1.1", "nobody@example.com"), false);
});

test("login: 5 failures from the same IP against the same email trips the tight ip_and_email tier", async () => {
  const ip = "10.0.0.1";
  const email = "victim-1@example.com";
  for (let i = 0; i < 4; i++) {
    await recordAttempt("login", ip, email);
  }
  assert.equal(await isRateLimited("login", ip, email), false);

  await recordAttempt("login", ip, email);
  assert.equal(await isRateLimited("login", ip, email), true);
});

test("login: 5 failures against a DIFFERENT email from the same IP does not trip that email's ip_and_email tier", async () => {
  const ip = "10.0.0.2";
  const attackedEmail = "victim-2@example.com";
  for (let i = 0; i < 5; i++) {
    await recordAttempt("login", ip, `other-${i}@example.com`);
  }
  assert.equal(await isRateLimited("login", ip, attackedEmail), false);
});

test("login: 20 failures from one IP across many different emails trips the per-IP tier", async () => {
  const ip = "10.0.0.3";
  for (let i = 0; i < 19; i++) {
    await recordAttempt("login", ip, `spray-${i}@example.com`);
  }
  assert.equal(await isRateLimited("login", ip, "spray-fresh@example.com"), false);

  await recordAttempt("login", ip, "spray-19@example.com");
  // A brand new email from the same IP is still limited — this is the per-IP tier, independent of
  // which specific email is being tried.
  assert.equal(await isRateLimited("login", ip, "spray-fresh@example.com"), true);
});

test("login: 50 failures against one email from rotating IPs trips the per-email tier even though no single IP or IP+email pair reached its own threshold", async () => {
  const email = "judge-account@example.com";
  for (let i = 0; i < 49; i++) {
    await recordAttempt("login", `10.1.0.${i}`, email);
  }
  assert.equal(await isRateLimited("login", "10.1.0.100", email), false);

  await recordAttempt("login", "10.1.0.49", email);
  assert.equal(await isRateLimited("login", "10.1.0.100", email), true);
});

test("login: an attempt outside its rule's window does not count", async () => {
  const ip = "10.0.0.4";
  const email = "stale-1@example.com";
  const twentyMinutesAgo = new Date(Date.now() - 20 * 60 * 1000);
  for (let i = 0; i < 5; i++) {
    await recordAttempt("login", ip, email, twentyMinutesAgo);
  }
  // ip_and_email's window is 15 minutes — these are 20 minutes old.
  assert.equal(await isRateLimited("login", ip, email), false);
});

test("register: 10 attempts from one IP trips its per-IP tier regardless of outcome", async () => {
  const ip = "10.0.0.5";
  for (let i = 0; i < 9; i++) {
    await recordAttempt("register", ip, `new-${i}@example.com`);
  }
  assert.equal(await isRateLimited("register", ip, "new-fresh@example.com"), false);

  await recordAttempt("register", ip, "new-9@example.com");
  assert.equal(await isRateLimited("register", ip, "new-fresh@example.com"), true);
});

test("register: 5 attempts against one email trips its per-email tier", async () => {
  const email = "popular@example.com";
  for (let i = 0; i < 4; i++) {
    await recordAttempt("register", `10.0.1.${i}`, email);
  }
  assert.equal(await isRateLimited("register", "10.0.1.100", email), false);

  await recordAttempt("register", "10.0.1.4", email);
  assert.equal(await isRateLimited("register", "10.0.1.100", email), true);
});

test("login and register attempts are counted in separate namespaces", async () => {
  const ip = "10.0.0.6";
  const email = "namespace-test@example.com";
  for (let i = 0; i < 5; i++) {
    await recordAttempt("login", ip, email);
  }
  assert.equal(await isRateLimited("login", ip, email), true);
  assert.equal(await isRateLimited("register", ip, email), false);
});
