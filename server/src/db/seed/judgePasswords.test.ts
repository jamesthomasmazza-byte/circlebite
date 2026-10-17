import assert from "node:assert/strict";
import { test } from "node:test";

import { credentialLines, generateJudgePasswords, legacyPasswordEnvError } from "./judgePasswords.js";

const KEYS = ["judge1", "judge2", "judge3", "judge4"];

test("four distinct 24-character passwords, one per judge key", () => {
  const passwords = generateJudgePasswords(KEYS);
  assert.deepEqual(Object.keys(passwords), KEYS);
  for (const p of Object.values(passwords)) assert.match(p, /^[A-Za-z0-9_-]{24}$/);
  assert.equal(new Set(Object.values(passwords)).size, 4);
});

test("each line is labelled by login; only a new password is shown, a kept one never is", () => {
  const passwords = generateJudgePasswords(KEYS);
  const lines = credentialLines(
    [
      { judgeKey: "judge1", email: "judge1@demo.circlebite.test", status: "new" },
      { judgeKey: "judge2", email: "judge2@demo.circlebite.test", status: "kept" },
    ],
    passwords,
  );

  assert.equal(lines.length, 2);
  assert.ok(lines[0].startsWith("judge1@demo.circlebite.test"));
  assert.ok(lines[0].includes(passwords.judge1));
  assert.equal(lines[1], "judge2@demo.circlebite.test  kept existing password");
  for (const p of Object.values(passwords)) assert.ok(!lines[1].includes(p));
  // A line shows its own judge's password and nobody else's.
  for (const key of ["judge2", "judge3", "judge4"]) assert.ok(!lines[0].includes(passwords[key]));
});

test("a leftover JUDGE_PASSWORD is refused, even when empty; unset is fine", () => {
  assert.equal(legacyPasswordEnvError({}), null);
  assert.match(legacyPasswordEnvError({ JUDGE_PASSWORD: "anything-at-all" }) ?? "", /nothing was changed/);
  assert.match(legacyPasswordEnvError({ JUDGE_PASSWORD: "" }) ?? "", /nothing was changed/);
});
