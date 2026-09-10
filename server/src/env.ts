import "dotenv/config";

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

/**
 * `raw ?? fallback` looks equivalent to this but isn't: `??` only falls back on null/undefined,
 * not on an empty string — and an env var present in the file but left blank (exactly what
 * .env.example ships as its template for an optional numeric var) comes through as `""`, not
 * undefined. `Number("")` is 0, not NaN, so a blank AI_DAILY_SPEND_CAP_CENTS silently became a
 * real $0.00 cap that refused every AI call, not "no cap configured, use the default." Also falls
 * back on non-numeric garbage rather than propagating NaN, which would have the same silent-zero
 * failure mode (NaN comparisons are always false).
 */
export function parseOptionalCents(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw.trim() === "") return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  isProduction: process.env.NODE_ENV === "production",
  port: Number(process.env.PORT ?? 3000),
  databaseUrl: required("DATABASE_URL"),
  sessionSecret: required("SESSION_SECRET"),
  offUserAgent: required("OFF_USER_AGENT"),
  // Optional, not required(): a missing key must not break every other scan type or local dev
  // without one. aiClient treats a missing key the same as any other call failure, so the
  // verdict engine's existing fail-closed path covers it rather than needing a second branch.
  aiApiKey: process.env.AI_API_KEY,
  aiModel: process.env.AI_MODEL ?? "claude-haiku-4-5-20251001",
  // In-app spend rail, on top of (not instead of) the console-side cap on the sandbox key itself.
  aiDailySpendCapCents: parseOptionalCents(process.env.AI_DAILY_SPEND_CAP_CENTS, 200),
  // Where correction photos land. required(), not defaulted: a path.join(process.cwd(), "uploads")
  // fallback looked reasonable but was a live bug — process.cwd() for the systemd service is
  // WorkingDirectory (~/circlebite/current/server), which scripts/release.sh repoints to a new
  // release on every deploy. A default landing there meant every correction photo — required
  // evidence for corroboration — was deleted the moment the *next* deploy ran, not eventually when
  // an old release got pruned. Found by checking the box directly (UPLOAD_DIR was never actually
  // set in ~/circlebite/.env, despite the comment here previously claiming production "must"
  // override the default) rather than trusting that the comment matched reality. Production must
  // point outside the versioned release tree (~/circlebite/uploads/, a sibling of releases/ and
  // current/ — see docs/server-setup.md §8); local dev needs its own explicit value too now, same
  // as every other required() var below.
  uploadDir: required("UPLOAD_DIR"),
};
