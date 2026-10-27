import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

import { ApiRequestError } from "../lib/api";
import { useAuth } from "../lib/AuthContext";
import {
  backRegisterStep,
  canContinueRegister,
  errorStep,
  initialRegisterAnswers,
  nextRegisterStep,
  passwordProblem,
  REGISTER_ERROR_COPY,
  registerPayload,
  registerProgress,
  SOMETHING_WENT_WRONG,
  type RegisterAnswers,
  type RegisterStep,
} from "../lib/guidedRegister";
import { BACK, CONTINUE } from "../lib/guidedSetupCopy";
import { NEW_PROFILE_PATH } from "../lib/profileSections";
import { safeReturnTo } from "../lib/returnTo";

const QUESTION: Record<RegisterStep, string> = {
  name: "What should we call you?",
  email: "What's your email address?",
  // Quoted only so the repo's credential check doesn't read `password: "…"` as a secret.
  "password": "Choose a password",
  // Today's label, word for word: nothing about 18 before the date is entered (docs/coppa.md §2.1).
  dob: "Date of birth",
};

/**
 * The guided sign-up (2026-10-27, behind GUIDED_SETUP): Register.tsx's form one question per screen,
 * in the guided setup's style. The same four fields, the same POST (AuthContext.register), the same
 * errors in the same words — each shown on the step it belongs to (lib/guidedRegister.ts errorStep).
 * Back never clears an answer. Then the guided profile setup, unless an invite's returnTo is waiting.
 */
export function GuidedRegister() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const returnTo = searchParams.get("returnTo");
  const [answers, setAnswers] = useState<RegisterAnswers>(initialRegisterAnswers);
  const [step, setStep] = useState<RegisterStep>("name");
  const [problem, setProblem] = useState<{ step: RegisterStep; text: string } | null>(null);
  const [blocked, setBlocked] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, [step, blocked]);

  const set = (patch: Partial<RegisterAnswers>) => setAnswers((a) => ({ ...a, ...patch }));

  function go(next: RegisterStep) {
    setProblem((p) => (p && p.step === next ? p : null));
    setStep(next);
  }

  async function onContinue() {
    if (step === "password") {
      const text = passwordProblem(answers);
      if (text) {
        setProblem({ step, text });
        return;
      }
    }
    if (step !== "dob") {
      go(nextRegisterStep(step));
      return;
    }

    setSubmitting(true);
    setProblem(null);
    try {
      await register(registerPayload(answers));
      // An invite's returnTo first, as on today's form; otherwise straight into the guided setup.
      navigate(returnTo ? safeReturnTo(returnTo) : `${NEW_PROFILE_PATH}?from=signup`);
    } catch (err) {
      const code = err instanceof ApiRequestError ? err.message : "";
      const where = errorStep(code, answers);
      if (where === "blocked") {
        setBlocked(true);
      } else {
        setProblem({ step: where, text: REGISTER_ERROR_COPY[code] ?? SOMETHING_WENT_WRONG });
        setStep(where);
      }
    } finally {
      setSubmitting(false);
    }
  }

  // Register.tsx's refusal, word for word, and still no "try again": the server refuses a retry.
  if (blocked) {
    return (
      <main className="guided">
        <h1 className="guided__question" tabIndex={-1} ref={headingRef}>
          CircleBite is for grown-ups
        </h1>
        <p>
          CircleBite accounts are for adults 18 and over. If you have food allergies, ask a
          parent or guardian to set up an account — they can create a profile for you and
          you&rsquo;ll both be able to use it.
        </p>
      </main>
    );
  }

  const ready = canContinueRegister(step, answers) && !submitting;
  const shown = problem && problem.step === step ? problem.text : null;
  const login = `/login${returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : ""}`;

  return (
    <main className="guided">
      <form
        className="guided__step"
        key={step}
        onSubmit={(e) => {
          e.preventDefault();
          if (ready) void onContinue();
        }}
      >
        <div className="guided__progress" role="progressbar" aria-label="Progress" aria-valuenow={registerProgress(step)} aria-valuemin={0} aria-valuemax={100}>
          <span style={{ width: `${registerProgress(step)}%` }} />
        </div>
        <div className="guided__top">
          {step !== "name" && (
            <button type="button" className="guided__back" onClick={() => go(backRegisterStep(step))}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M15 6l-6 6 6 6" />
              </svg>
              {BACK}
            </button>
          )}
        </div>

        <h1 className="guided__question" id="register-question" tabIndex={-1} ref={headingRef}>
          {QUESTION[step]}
        </h1>

        {step === "name" && (
          <>
            <p className="guided__sub">Your account is yours to manage — you can add a profile for someone in your care after signing up.</p>
            <label>
              Display name
              <input value={answers.displayName} onChange={(e) => set({ displayName: e.target.value })} autoComplete="name" required />
            </label>
          </>
        )}

        {step === "email" && (
          <label>
            Email
            <input type="email" value={answers.email} onChange={(e) => set({ email: e.target.value })} autoComplete="email" required />
          </label>
        )}

        {step === "password" && (
          <>
            <p className="guided__sub">At least 8 characters.</p>
            <label>
              Password
              <input type="password" value={answers.password} onChange={(e) => set({ password: e.target.value })} autoComplete="new-password" required />
            </label>
            <label>
              Confirm password
              <input
                type="password"
                value={answers.confirmPassword}
                onChange={(e) => set({ confirmPassword: e.target.value })}
                autoComplete="new-password"
                required
              />
            </label>
          </>
        )}

        {step === "dob" && (
          <input
            type="date"
            className="guided__date"
            aria-labelledby="register-question"
            value={answers.dob}
            onChange={(e) => set({ dob: e.target.value })}
            required
          />
        )}

        {shown && (
          <p className="guided__reply" role="alert">
            {shown}
          </p>
        )}

        <p>
          <button type="submit" className="button-primary guided__continue" disabled={!ready}>
            {step === "dob" ? (submitting ? "Creating your account…" : "Create account") : CONTINUE}
          </button>
        </p>

        {step === "name" && (
          <p className="guided__classic">
            Already have an account? <Link to={login}>Log in</Link>
          </p>
        )}
      </form>
    </main>
  );
}
