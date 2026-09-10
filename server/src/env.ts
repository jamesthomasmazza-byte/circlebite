import "dotenv/config";

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
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
  aiDailySpendCapCents: Number(process.env.AI_DAILY_SPEND_CAP_CENTS ?? 200),
};
