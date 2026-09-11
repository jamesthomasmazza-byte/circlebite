import { useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

import { ApiRequestError } from "../lib/api";
import { useAuth } from "../lib/AuthContext";
import { safeReturnTo } from "../lib/returnTo";

const ERROR_COPY: Record<string, string> = {
  invalid_request: "Check that every field is filled in, and that your password is at least 8 characters.",
  invalid_dob: "That doesn't look like a valid date.",
  email_taken: "An account with that email already exists.",
  too_many_attempts: "Too many attempts. Try again in 15 minutes.",
};

export function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [dob, setDob] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [blocked, setBlocked] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    // Checked client-side, before the request: auto-login means there's no second chance to
    // catch a typo at a login screen, and password reset doesn't exist yet, so a mistyped
    // password here would lock the account out with no way back in.
    if (password !== confirmPassword) {
      setError("Passwords don't match.");
      return;
    }

    setSubmitting(true);
    try {
      await register({ email, password, displayName, dob });
      navigate(safeReturnTo(searchParams.get("returnTo")));
    } catch (err) {
      if (err instanceof ApiRequestError && err.message === "age_gate_blocked") {
        setBlocked(true);
      } else if (err instanceof ApiRequestError) {
        setError(ERROR_COPY[err.message] ?? "Something went wrong. Try again.");
      } else {
        setError("Something went wrong. Try again.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  // No "try again" — the retry-prevention block (docs/coppa.md §2.1) means a second attempt
  // is refused server-side regardless of what's entered, so offering a retry here would lie.
  if (blocked) {
    return (
      <main>
        <h1>CircleBite is for grown-ups</h1>
        <p>
          CircleBite accounts are for adults 18 and over. If you have food allergies, ask a
          parent or guardian to set up an account — they can create a profile for you and
          you&rsquo;ll both be able to use it.
        </p>
      </main>
    );
  }

  return (
    <main>
      <h1>Create your account</h1>
      <p>Your account is yours to manage — you can add a profile for someone in your care after signing up.</p>
      <form onSubmit={handleSubmit}>
        <label>
          Display name
          <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} required />
        </label>
        <label>
          Email
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
          />
        </label>
        <label>
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            minLength={8}
            required
          />
        </label>
        <label>
          Confirm password
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            autoComplete="new-password"
            minLength={8}
            required
          />
        </label>
        <label>
          Date of birth
          <input type="date" value={dob} onChange={(e) => setDob(e.target.value)} required />
        </label>
        {error && <p role="alert">{error}</p>}
        <button type="submit" disabled={submitting}>
          Create account
        </button>
      </form>
      <p>
        Already have an account?{" "}
        <Link to={`/login${searchParams.get("returnTo") ? `?returnTo=${encodeURIComponent(searchParams.get("returnTo")!)}` : ""}`}>
          Log in
        </Link>
      </p>
    </main>
  );
}
