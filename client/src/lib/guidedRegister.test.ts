import assert from "node:assert/strict";
import { test } from "node:test";

import {
  backRegisterStep,
  canContinueRegister,
  errorStep,
  initialRegisterAnswers,
  nextRegisterStep,
  passwordProblem,
  PASSWORDS_DONT_MATCH,
  PASSWORD_TOO_SHORT,
  REGISTER_STEPS,
  registerPayload,
  registerProgress,
  signupSetupProgress,
  type RegisterAnswers,
} from "./guidedRegister";

// The guided sign-up (2026-10-27): today's register form, one question per screen.

const FULL: RegisterAnswers = { displayName: "Pat", email: "pat@example.com", password: "pw-12345", confirmPassword: "pw-12345", dob: "1990-04-02" };

test("each server error lands on the step it belongs to", () => {
  assert.equal(errorStep("email_taken", FULL), "email");
  assert.equal(errorStep("invalid_dob", FULL), "dob");
  assert.equal(errorStep("too_many_attempts", FULL), "dob");
  assert.equal(errorStep("anything_else", FULL), "dob");
  assert.equal(errorStep("age_gate_blocked", FULL), "blocked", "the under-18 refusal is its own screen");
});

test("invalid_request goes to the first answer that breaks a rule; otherwise the email (the seed domain)", () => {
  assert.equal(errorStep("invalid_request", { ...FULL, displayName: "  " }), "name");
  assert.equal(errorStep("invalid_request", { ...FULL, email: "pat.example.com" }), "email");
  assert.equal(errorStep("invalid_request", { ...FULL, password: "short" }), "password");
  assert.equal(errorStep("invalid_request", { ...FULL, email: "judge9@demo.circlebite.test" }), "email");
});

test("each step's Continue: a name, an email with '@', both passwords, a date", () => {
  const empty = initialRegisterAnswers();
  for (const step of REGISTER_STEPS) assert.equal(canContinueRegister(step, empty), false, step);
  for (const step of REGISTER_STEPS) assert.equal(canContinueRegister(step, FULL), true, step);
  assert.equal(canContinueRegister("email", { ...FULL, email: "pat" }), false);
});

test("the password step's rules are today's: 8 characters, and the two must match", () => {
  assert.equal(passwordProblem(FULL), null);
  assert.equal(passwordProblem({ ...FULL, password: "1234567", confirmPassword: "1234567" }), PASSWORD_TOO_SHORT);
  assert.equal(passwordProblem({ ...FULL, confirmPassword: "pw-1234X" }), PASSWORDS_DONT_MATCH);
  assert.equal(PASSWORDS_DONT_MATCH, "Passwords don't match.");
});

test("Back and Continue only move; nothing is cleared", () => {
  assert.deepEqual(REGISTER_STEPS, ["name", "email", "password", "dob"]);
  assert.equal(nextRegisterStep("password"), "dob");
  assert.equal(backRegisterStep("dob"), "password");
  assert.equal(backRegisterStep("name"), "name");
});

test("the request is exactly Register.tsx's: the same four fields", () => {
  assert.deepEqual(registerPayload(FULL), { email: "pat@example.com", password: "pw-12345", displayName: "Pat", dob: "1990-04-02" });
  assert.deepEqual(Object.keys(registerPayload(FULL)).sort(), ["displayName", "dob", "email", "password"]);
});

test("one progress bar: register fills its share, and the setup carries on from there without going back", () => {
  const last = registerProgress("dob");
  assert.ok(registerProgress("name") < registerProgress("email"));
  assert.ok(signupSetupProgress(0) >= last, "the setup starts where register stopped");
  assert.equal(signupSetupProgress(100), 100);
});
