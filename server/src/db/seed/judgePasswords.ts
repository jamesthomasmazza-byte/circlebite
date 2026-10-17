import { randomBytes } from "node:crypto";

import type { JudgeCredential } from "./judgeSeed.js";

// The judge passwords' plaintext lives here and in seedJudge.ts's main() only: generated, hashed,
// printed once to the operator's terminal, and dropped. The seed itself sees hashes (R8 — never in
// the repo, a file or a log). One password per judge: four accounts exist so four judges never
// land in each other's worlds, and a shared password undid that for anyone who mistyped a number.

/** One fresh 24-character password per judge key. */
export function generateJudgePasswords(judgeKeys: string[]): Record<string, string> {
  const passwords: Record<string, string> = {};
  for (const key of judgeKeys) passwords[key] = randomBytes(18).toString("base64url");
  // 144 random bits each, so this never fires; it's here so "distinct" is checked, not assumed.
  if (new Set(Object.values(passwords)).size !== judgeKeys.length) {
    throw new Error("Generated judge passwords collided — nothing was changed.");
  }
  return passwords;
}

/**
 * The old runbook exported one JUDGE_PASSWORD for all four judges. Refuse rather than ignore it: an
 * operator who set it expects it to be used, and a seed that silently did something else would hand
 * out logins that don't match what they think they set.
 */
export function legacyPasswordEnvError(env: Record<string, string | undefined>): string | null {
  if (env.JUDGE_PASSWORD === undefined) return null;
  return (
    "JUDGE_PASSWORD is set, but each judge now gets their own generated password — nothing was changed. " +
    "Run `unset JUDGE_PASSWORD` and rerun (add --rotate-passwords to replace all four)."
  );
}

/** One line per judge, labelled by login. Only a new password is shown; a kept one never is. */
export function credentialLines(credentials: JudgeCredential[], passwords: Record<string, string>): string[] {
  return credentials.map((c) =>
    c.status === "new" ? `${c.email}  new password (shown once): ${passwords[c.judgeKey]}` : `${c.email}  kept existing password`,
  );
}
