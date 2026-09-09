import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";

import { useAuth } from "../lib/AuthContext";

export function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(email, password);
      navigate("/dashboard");
    } catch {
      setError("That email or password doesn't match an account.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main>
      <h1>Log in</h1>
      <form onSubmit={handleSubmit}>
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
            autoComplete="current-password"
            required
          />
        </label>
        {error && <p role="alert">{error}</p>}
        <button type="submit" disabled={submitting}>
          Log in
        </button>
      </form>
      <p>
        Need an account? <Link to="/register">Register</Link>
      </p>
    </main>
  );
}
