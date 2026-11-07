import { createHash, timingSafeEqual } from "node:crypto";

import { JUDGE_LINK_POOL_EMAILS } from "../db/seed/seedData.js";
import { env } from "../env.js";

// The judge link's rules (2026-11-07, Prof. Yoest's Nov 5, 4:38 PM ask), apart from its route so the
// session check (session.ts) can use them without importing the route.

const POOL_EMAILS = new Set(JUDGE_LINK_POOL_EMAILS);

/** One of the seed's 40 pool judges, by exact address: the only accounts the link signs in to. */
export function isJudgeLinkAccount(email: string): boolean {
  return POOL_EMAILS.has(email);
}

/** The link works only with JUDGE_LINK on and before JUDGE_LINK_EXPIRES. Sessions it made too. */
export function judgeLinkOpen(now: Date): boolean {
  return env.judgeLink && now.getTime() < env.judgeLinkExpires.getTime();
}

/** What a token looks like: 32 random bytes base64url (43 characters), with room either side. */
const TOKEN_SHAPE = /^[A-Za-z0-9_-]{32,128}$/;

/**
 * Whether `token` is the link's: its SHA-256 against the stored digest, compared in constant time.
 * No digest configured matches nothing. Anything not token-shaped is refused before hashing.
 */
export function tokenMatches(token: unknown, storedHashHex: string | undefined): boolean {
  if (!storedHashHex || typeof token !== "string" || !TOKEN_SHAPE.test(token)) return false;
  const given = createHash("sha256").update(token).digest();
  const stored = Buffer.from(storedHashHex, "hex");
  return stored.length === given.length && timingSafeEqual(given, stored);
}
