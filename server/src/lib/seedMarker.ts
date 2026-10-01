// The one marker the judge seed script (server/src/db/seedJudge.ts) finds its own accounts by.
// `.test` is reserved by RFC 6761 — no real mailbox can ever have this address, so the seed can
// never mistake a real person for one of its invented ones. Signup refuses it (auth/routes.ts): the
// seed deletes and recreates every account on this domain, so letting anyone register one would let
// a reseed take a real account with it.
export const SEED_EMAIL_DOMAIN = "demo.circlebite.test";

/** True for an address on the seed domain. Expects an already-normalized (trimmed, lowercased) email. */
export function isSeedEmail(normalizedEmail: string): boolean {
  return normalizedEmail.endsWith(`@${SEED_EMAIL_DOMAIN}`);
}
