// One command for all judge demo data: `npm run seed:judge -w server` (add `-- --force` to clear
// non-seeded people off seeded profiles). See docs/server-setup.md for the exact production steps
// and seed/judgeSeed.ts for what a run does.
//
// Judge passwords, one per judge account (CONTEST_RULES.md R8 — never in the repo, a file or a log):
//   - A judge whose account exists keeps their password, so a recovery reseed doesn't change the
//     other judges' logins. A missing judge (first run, or one who deleted their account) gets a
//     new one.
//   - `--rotate-passwords` gives all four new ones — the run before credentials go out.
//   - New passwords are generated here and printed once, to this terminal only. Nothing is ever
//     supplied from outside; a leftover JUDGE_PASSWORD from the old one-password runbook is refused.

import { randomBytes } from "node:crypto";

import { hashPassword } from "../auth/password.js";
import { JUDGE_CASTS } from "./seed/seedData.js";
import { runJudgeSeed, SeedConflictError } from "./seed/judgeSeed.js";
import { credentialLines, generateJudgePasswords, legacyPasswordEnvError } from "./seed/judgePasswords.js";
import { pool } from "./pool.js";

async function main(): Promise<void> {
  const force = process.argv.includes("--force");
  const rotatePasswords = process.argv.includes("--rotate-passwords");

  const legacy = legacyPasswordEnvError(process.env);
  if (legacy) {
    console.error(legacy);
    process.exitCode = 1;
    return;
  }

  const judgeKeys = JUDGE_CASTS.map((c) => c.judge);
  const passwords = generateJudgePasswords(judgeKeys);
  const judgePasswordHashes = Object.fromEntries(
    await Promise.all(judgeKeys.map(async (key) => [key, await hashPassword(passwords[key])] as const)),
  );

  try {
    const summary = await runJudgeSeed({
      judgePasswordHashes,
      otherPasswordHash: await hashPassword(randomBytes(32).toString("base64url")),
      force,
      rotatePasswords,
    });

    if (summary.forcedRemovals) {
      const c = summary.forcedRemovals;
      console.log(
        `--force removed from seeded profiles: ${c.coManagers} co-manager(s), ${c.followers} follower(s), ` +
          `${c.scans} scan(s) by non-seeded people; replaced ${c.products} non-seed product cache row(s).`,
      );
    }
    if (summary.judgeCorrectionsRejected > 0) {
      console.log(`Rejected ${summary.judgeCorrectionsRejected} correction(s) the seeded accounts had filed.`);
    }
    console.log(
      `Seeded ${summary.accounts} accounts, ${summary.profiles} profiles, ${summary.scans} scans, ${summary.npsRows} NPS rows.`,
    );
    console.log("Judge logins — each line goes in that judge's own one-time link, and nowhere else:");
    for (const line of credentialLines(summary.judgeCredentials, passwords)) console.log(`  ${line}`);
  } catch (err) {
    if (err instanceof SeedConflictError) {
      const c = err.conflicts;
      console.error(
        "Not seeded — nothing was changed. Seeded profiles have non-seeded people or rows attached:\n" +
          `  co-managers: ${c.coManagers}\n  followers: ${c.followers}\n  scans by non-seeded people: ${c.scans}\n` +
          `  non-seed product cache rows on seed barcodes: ${c.products}\n` +
          "Rerun with --force to remove them (only rows on seeded profiles — never anyone's own account or profiles).",
      );
      process.exitCode = 1;
      return;
    }
    throw err;
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
