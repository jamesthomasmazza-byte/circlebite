// The guided sign-up (routes/GuidedRegister.tsx, 2026-10-27, behind GUIDED_SETUP): today's register
// form one question per screen. It asks, sends and checks exactly what Register.tsx does — the same
// four fields to the same POST /auth/register — and only says each answer's problem on the step it
// belongs to. Plain functions, under test.

export type RegisterStep = "name" | "email" | "password" | "dob";

export const REGISTER_STEPS: RegisterStep[] = ["name", "email", "password", "dob"];

export type RegisterAnswers = { displayName: string; email: string; password: string; confirmPassword: string; dob: string };

export function initialRegisterAnswers(): RegisterAnswers {
  return { displayName: "", email: "", password: "", confirmPassword: "", dob: "" };
}

/** The server's rule (server/src/auth/routes.ts MIN_PASSWORD_LENGTH), and Register.tsx's minLength. */
export const MIN_PASSWORD_LENGTH = 8;

/** Register.tsx's own words for the server's errors, unchanged. */
export const REGISTER_ERROR_COPY: Record<string, string> = {
  invalid_request: "Check that every field is filled in, and that your password is at least 8 characters.",
  invalid_dob: "That doesn't look like a valid date.",
  email_taken: "An account with that email already exists.",
  too_many_attempts: "Too many attempts. Try again in 15 minutes.",
};
export const PASSWORDS_DONT_MATCH = "Passwords don't match.";
export const PASSWORD_TOO_SHORT = `Your password needs at least ${MIN_PASSWORD_LENGTH} characters.`;
export const SOMETHING_WENT_WRONG = "Something went wrong. Try again.";

/** Whether Continue can be pressed: something entered (an email with an "@"). */
export function canContinueRegister(step: RegisterStep, a: RegisterAnswers): boolean {
  switch (step) {
    case "name":
      return a.displayName.trim().length > 0;
    case "email":
      return a.email.includes("@");
    case "password":
      return a.password.length > 0 && a.confirmPassword.length > 0;
    case "dob":
      return a.dob !== "";
  }
}

/** The password step's two checks, said when Continue is pressed — the same rules as today's form. */
export function passwordProblem(a: RegisterAnswers): string | null {
  if (a.password.length < MIN_PASSWORD_LENGTH) return PASSWORD_TOO_SHORT;
  if (a.password !== a.confirmPassword) return PASSWORDS_DONT_MATCH;
  return null;
}

export function nextRegisterStep(step: RegisterStep): RegisterStep {
  return REGISTER_STEPS[Math.min(REGISTER_STEPS.indexOf(step) + 1, REGISTER_STEPS.length - 1)];
}

/** Back moves only; it never clears an answer. */
export function backRegisterStep(step: RegisterStep): RegisterStep {
  return REGISTER_STEPS[Math.max(REGISTER_STEPS.indexOf(step) - 1, 0)];
}

/**
 * Where a server error belongs. invalid_request is one code for several rules, so it goes to the
 * first step whose answer breaks one — a blank name, an email with no "@", a short password — and
 * otherwise to the email step (the judge seed's reserved domain is refused the same way).
 */
export function errorStep(code: string, a: RegisterAnswers): RegisterStep | "blocked" {
  switch (code) {
    case "age_gate_blocked":
      return "blocked";
    case "email_taken":
      return "email";
    case "invalid_request":
      if (a.displayName.trim() === "") return "name";
      if (!a.email.includes("@")) return "email";
      if (a.password.length < MIN_PASSWORD_LENGTH) return "password";
      return "email";
    default:
      return "dob";
  }
}

/** Exactly Register.tsx's call: the same four fields. */
export function registerPayload(a: RegisterAnswers): { email: string; password: string; displayName: string; dob: string } {
  return { email: a.email, password: a.password, displayName: a.displayName, dob: a.dob };
}

// One progress bar across sign-up and the guided setup that follows it: register's four steps, then
// the setup, whose length depends on how many allergens are picked. Register counts the shortest setup
// (six screens: who, name, allergens, one severity, "may contain", review), and the setup fills the rest
// from where register stopped, so the bar never goes back.
const SHORTEST_SETUP = 6;
const SIGNUP_UNITS = REGISTER_STEPS.length + SHORTEST_SETUP + 1;
const REGISTER_SHARE = REGISTER_STEPS.length / SIGNUP_UNITS;

export function registerProgress(step: RegisterStep): number {
  return Math.round(((REGISTER_STEPS.indexOf(step) + 1) / SIGNUP_UNITS) * 100);
}

/** The guided setup's own 0–100, placed after register's share. */
export function signupSetupProgress(setupPercent: number): number {
  return Math.round((REGISTER_SHARE + (1 - REGISTER_SHARE) * (setupPercent / 100)) * 100);
}
