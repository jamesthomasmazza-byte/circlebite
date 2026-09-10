import { createHash, randomBytes } from "node:crypto";

// Plain SHA-256, not HMAC — same reasoning as elsewhere in this codebase for tokens (see
// follow_relationships' migration comment): a leaked tokens table alone shouldn't grant access,
// only the full URL does, and the 256-bit random token already supplies all the entropy a keyed
// hash would add.

export function generateInviteToken(): string {
  return randomBytes(32).toString("hex");
}

export function hashInviteToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
