import { pool } from "../db/pool.js";
import { normalizeEmail } from "./email.js";

const SIGNUP_BLOCK_HOURS = 24;
const MINIMUM_ADULT_AGE = 18;

export type AgeGateResult = { valid: true; isAdult: boolean; age: number } | { valid: false };

/** Parses a "YYYY-MM-DD" date of birth and evaluates the 18+ gate. Never returns or logs the DOB. */
export function evaluateAgeGate(dob: string, asOf: Date = new Date()): AgeGateResult {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dob.trim());
  if (!match) return { valid: false };

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const asUtc = Date.UTC(year, month - 1, day);
  const parsed = new Date(asUtc);
  const isRealDate =
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day;
  if (!isRealDate || asUtc > asOf.getTime()) return { valid: false };

  let age = asOf.getUTCFullYear() - year;
  const hadBirthdayThisYear =
    asOf.getUTCMonth() > month - 1 ||
    (asOf.getUTCMonth() === month - 1 && asOf.getUTCDate() >= day);
  if (!hadBirthdayThisYear) age -= 1;

  return { valid: true, isAdult: age >= MINIMUM_ADULT_AGE, age };
}

export async function isSignupBlocked(email: string): Promise<boolean> {
  const { rows } = await pool.query(
    `SELECT 1 FROM signup_blocks
     WHERE email = $1 AND blocked_at > now() - make_interval(hours => $2)`,
    [normalizeEmail(email), SIGNUP_BLOCK_HOURS],
  );
  return rows.length > 0;
}

export async function blockSignup(email: string): Promise<void> {
  await pool.query(
    `INSERT INTO signup_blocks (email, blocked_at) VALUES ($1, now())
     ON CONFLICT (email) DO UPDATE SET blocked_at = now()`,
    [normalizeEmail(email)],
  );
}
