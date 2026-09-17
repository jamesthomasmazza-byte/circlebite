import { useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";

import { resetPassword } from "../lib/api";

// No GET preview step here, unlike AcceptFollow/AcceptCoManager: there's nothing meaningful to
// preview before submitting a new password (no profile label, no inviter identity), and a preview
// endpoint would only ever answer "is this token still valid" — a second, purely
// reconnaissance-oriented existence oracle. Renders the form directly instead.
export function ResetPassword() {
  const { token } = useParams<{ token: string }>();

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [succeeded, setSucceeded] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    if (newPassword !== confirmPassword) {
      setError("Passwords don't match.");
      return;
    }

    setSubmitting(true);
    try {
      await resetPassword(token!, newPassword);
      setSucceeded(true);
    } catch {
      // One fixed message regardless of the underlying reason (expired, already used, never
      // existed) — never branch on the error code here, same generic-error discipline the server
      // side already applies.
      setError("This link is invalid or has expired.");
    } finally {
      setSubmitting(false);
    }
  }

  if (succeeded) {
    return (
      <main>
        <h1>Password updated</h1>
        <p>
          Log in with your new password. <Link to="/login">Log in</Link>
        </p>
      </main>
    );
  }

  return (
    <main>
      <h1>Set a new password</h1>
      <form onSubmit={handleSubmit}>
        <label>
          New password
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            autoComplete="new-password"
            minLength={8}
            required
          />
        </label>
        <label>
          Confirm new password
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            autoComplete="new-password"
            minLength={8}
            required
          />
        </label>
        {error && <p role="alert">{error}</p>}
        <button type="submit" disabled={submitting}>
          {submitting ? "Setting password…" : "Set new password"}
        </button>
      </form>
    </main>
  );
}
