import { Router } from "express";

import { pool } from "../db/pool.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { blockSignup, evaluateAgeGate, isSignupBlocked } from "./ageGate.js";
import { normalizeEmail } from "./email.js";
import { hashPassword, verifyPassword } from "./password.js";
import { createSession, revokeSession, SESSION_COOKIE_NAME, sessionCookieOptions } from "./session.js";

const MIN_PASSWORD_LENGTH = 8;

// Hashed once, lazily, and reused for every "email not found" login attempt so that path
// costs roughly the same CPU time as a real password check — otherwise a fast 401 for unknown
// emails vs. a slow one for known emails leaks which emails have accounts.
let dummyHash: Promise<string> | undefined;
function getDummyHash(): Promise<string> {
  dummyHash ??= hashPassword("not-a-real-password-used-only-for-timing");
  return dummyHash;
}

export const authRouter = Router();

authRouter.post(
  "/register",
  asyncHandler(async (req, res) => {
    const { email, password, displayName, dob } = req.body ?? {};

    if (
      typeof email !== "string" ||
      typeof password !== "string" ||
      typeof displayName !== "string" ||
      typeof dob !== "string"
    ) {
      res.status(400).json({ error: "invalid_request" });
      return;
    }

    const normalizedEmail = normalizeEmail(email);
    const trimmedDisplayName = displayName.trim();
    if (
      !normalizedEmail.includes("@") ||
      password.length < MIN_PASSWORD_LENGTH ||
      trimmedDisplayName.length === 0
    ) {
      res.status(400).json({ error: "invalid_request" });
      return;
    }

    // Checked before looking at this attempt's DOB: once blocked, blocked regardless of what
    // date is entered next (docs/coppa.md §2.1 — an immediate retry with a different date is
    // refused, not just a retry with the same date).
    if (await isSignupBlocked(normalizedEmail)) {
      res.status(403).json({ error: "age_gate_blocked" });
      return;
    }

    const gate = evaluateAgeGate(dob);
    if (!gate.valid) {
      res.status(400).json({ error: "invalid_dob" });
      return;
    }

    if (!gate.isAdult) {
      await blockSignup(normalizedEmail);
      res.status(403).json({ error: "age_gate_blocked" });
      return;
    }

    const passwordHash = await hashPassword(password);

    try {
      const { rows } = await pool.query<{ id: string; email: string; display_name: string }>(
        `INSERT INTO users (email, password_hash, display_name, age_attested_adult, age_attested_at)
         VALUES ($1, $2, $3, true, now())
         RETURNING id, email, display_name`,
        [normalizedEmail, passwordHash, trimmedDisplayName],
      );
      const user = rows[0]!;
      res.status(201).json({ id: user.id, email: user.email, displayName: user.display_name });
    } catch (err) {
      if (isUniqueViolation(err)) {
        res.status(409).json({ error: "email_taken" });
        return;
      }
      throw err;
    }
  }),
);

authRouter.post(
  "/login",
  asyncHandler(async (req, res) => {
    const { email, password } = req.body ?? {};

    if (typeof email !== "string" || typeof password !== "string") {
      res.status(400).json({ error: "invalid_request" });
      return;
    }

    const { rows } = await pool.query<{
      id: string;
      email: string;
      display_name: string;
      password_hash: string;
    }>("SELECT id, email, display_name, password_hash FROM users WHERE email = $1", [
      normalizeEmail(email),
    ]);
    const user = rows[0];

    if (!user) {
      await verifyPassword(password, await getDummyHash());
      res.status(401).json({ error: "invalid_credentials" });
      return;
    }

    const passwordOk = await verifyPassword(password, user.password_hash);
    if (!passwordOk) {
      res.status(401).json({ error: "invalid_credentials" });
      return;
    }

    const { token, expiresAt } = await createSession(user.id);
    res.cookie(SESSION_COOKIE_NAME, token, sessionCookieOptions());
    res.status(200).json({
      id: user.id,
      email: user.email,
      displayName: user.display_name,
      expiresAt,
    });
  }),
);

authRouter.post(
  "/logout",
  asyncHandler(async (req, res) => {
    const token = req.cookies?.[SESSION_COOKIE_NAME];
    if (typeof token === "string") {
      await revokeSession(token);
    }
    res.clearCookie(SESSION_COOKIE_NAME, { path: "/" });
    res.status(200).json({ ok: true });
  }),
);

function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === "23505";
}
