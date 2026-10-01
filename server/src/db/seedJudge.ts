// One command for all judge demo data: `npm run seed:judge -w server` (add `-- --force` to clear
// non-seeded people off seeded profiles). See docs/server-setup.md for the exact production steps
// and seed/judgeSeed.ts for what a run does.
//
// The judge password (CONTEST_RULES.md R8 — never in the repo, never in a file or a log):
//   - JUDGE_PASSWORD set: used, and only confirmed as used — never echoed back. Set it with
//     `read -s JUDGE_PASSWORD && export JUDGE_PASSWORD` so it never lands in shell history.
//   - unset: a strong one is generated and printed once, to this terminal only.

import { randomBytes } from "node:crypto";

import { hashPassword } from "../auth/password.js";
import { PEOPLE } from "./seed/seedData.js";
import { runJudgeSeed, SeedConflictError } from "./seed/judgeSeed.js";
import { pool } from "./pool.js";

// Same floor the register route enforces (auth/routes.ts MIN_PASSWORD_LENGTH), raised: a password
// handed to strangers for a week should be stronger than the minimum a person may choose.
const MIN_SUPPLIED_PASSWORD_LENGTH = 12;

async function main(): Promise<void> {
  const force = process.argv.includes("--force");
  const supplied = process.env.JUDGE_PASSWORD;

  if (supplied !== undefined && supplied.length < MIN_SUPPLIED_PASSWORD_LENGTH) {
    console.error(`JUDGE_PASSWORD is shorter than ${MIN_SUPPLIED_PASSWORD_LENGTH} characters — nothing was changed.`);
    process.exitCode = 1;
    return;
  }
  const password = supplied ?? randomBytes(18).toString("base64url"); // 24 characters

  try {
    const summary = await runJudgeSeed({
      judgePasswordHash: await hashPassword(password),
      otherPasswordHash: await hashPassword(randomBytes(32).toString("base64url")),
      force,
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
    console.log(`Judge login: ${PEOPLE.judge.email}`);
    console.log(supplied !== undefined ? "Judge password: JUDGE_PASSWORD was used." : `Judge password (shown once): ${password}`);
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
