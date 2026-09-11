import { createHmac } from "node:crypto";

import { pool } from "../db/pool.js";
import { env } from "../env.js";
import { normalizeEmail } from "./email.js";

export type AuthEndpoint = "login" | "register";

type Scope = "ip" | "email" | "ip_and_email";

type RateLimitRule = { scope: Scope; windowMinutes: number; threshold: number };

/**
 * login: a lone per-email threshold (e.g. "5 failures locks it") would let anyone lock out any
 * account — including the judge account — with a cheap loop of wrong passwords from rotating IPs.
 * Three tiers instead: `ip_and_email` catches one attacker guessing one account (tight — 5/15min),
 * `ip` catches one source spraying many different emails (20/15min), and `email` alone is
 * deliberately much wider and longer (50/60min) so it only trips on a real distributed attempt
 * against one account, not on ordinary retries.
 *
 * register: there's no secret to guess, so every well-formed submission counts (success,
 * email_taken, or an age-gate rejection) — the concern is spam/abuse volume and probing a specific
 * email, not a specific failure mode.
 */
const RULES: Record<AuthEndpoint, RateLimitRule[]> = {
  login: [
    { scope: "ip_and_email", windowMinutes: 15, threshold: 5 },
    { scope: "ip", windowMinutes: 15, threshold: 20 },
    { scope: "email", windowMinutes: 60, threshold: 50 },
  ],
  register: [
    { scope: "ip", windowMinutes: 60, threshold: 10 },
    { scope: "email", windowMinutes: 60, threshold: 5 },
  ],
};

// Comfortably past the longest window any rule above uses (60 minutes) — this is table hygiene,
// not part of the rate-limit logic itself, which always filters by its own window regardless of
// what's still physically in the table.
const PRUNE_AFTER_HOURS = 24;

// docs/principles.md principle 5: the limiter only ever checks equality against the same value
// again, never needs the original IP or email back, so an HMAC (useless without SESSION_SECRET,
// and not reversible) does the job without keeping raw IPs or emails around. Reuses SESSION_SECRET
// rather than introducing a second secret purely for this — same pattern auth/session.ts already
// uses for session tokens, domain-separated here by the "ip:"/"email:" prefix so the two hash
// namespaces can never collide with each other or with session.ts's own use of the same key.
function hash(kind: "ip" | "email", value: string): string {
  return createHmac("sha256", env.sessionSecret).update(`${kind}:${value}`).digest("hex");
}

async function countAttempts(
  endpoint: AuthEndpoint,
  scope: Scope,
  ipHash: string,
  emailHash: string,
  windowMinutes: number,
): Promise<number> {
  let query: string;
  let params: unknown[];

  if (scope === "ip") {
    query = `SELECT count(*) FROM auth_attempts
              WHERE endpoint = $1 AND ip_hash = $2 AND occurred_at > now() - make_interval(mins => $3)`;
    params = [endpoint, ipHash, windowMinutes];
  } else if (scope === "email") {
    query = `SELECT count(*) FROM auth_attempts
              WHERE endpoint = $1 AND email_hash = $2 AND occurred_at > now() - make_interval(mins => $3)`;
    params = [endpoint, emailHash, windowMinutes];
  } else {
    query = `SELECT count(*) FROM auth_attempts
              WHERE endpoint = $1 AND ip_hash = $2 AND email_hash = $3 AND occurred_at > now() - make_interval(mins => $4)`;
    params = [endpoint, ipHash, emailHash, windowMinutes];
  }

  const { rows } = await pool.query<{ count: string }>(query, params);
  return Number(rows[0]?.count ?? 0);
}

export async function isRateLimited(endpoint: AuthEndpoint, ip: string, email: string): Promise<boolean> {
  const ipHash = hash("ip", ip);
  const emailHash = hash("email", normalizeEmail(email));
  const rules = RULES[endpoint];
  const counts = await Promise.all(
    rules.map((rule) => countAttempts(endpoint, rule.scope, ipHash, emailHash, rule.windowMinutes)),
  );
  return counts.some((count, i) => count >= rules[i].threshold);
}

/**
 * `occurredAt` defaults to now — same pattern as `ageGate.ts`'s `evaluateAgeGate(dob, asOf)` —
 * overridable so tests can seed an attempt at a specific past time to exercise window boundaries
 * without needing to export the hash function itself.
 */
export async function recordAttempt(
  endpoint: AuthEndpoint,
  ip: string,
  email: string,
  occurredAt: Date = new Date(),
): Promise<void> {
  await pool.query(
    `INSERT INTO auth_attempts (endpoint, ip_hash, email_hash, occurred_at) VALUES ($1, $2, $3, $4)`,
    [endpoint, hash("ip", ip), hash("email", normalizeEmail(email)), occurredAt],
  );
  await pool.query(`DELETE FROM auth_attempts WHERE occurred_at < now() - make_interval(hours => $1)`, [
    PRUNE_AFTER_HOURS,
  ]);
}
