import { useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "./AuthContext";

export default function LoginPage() {
  const { login, loginForLocalTesting } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [localUsername, setLocalUsername] = useState("");
  const [localPassword, setLocalPassword] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const [localSubmitting, setLocalSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const failureMessage = await login(email, password);
    setSubmitting(false);
    if (failureMessage) {
      setError(failureMessage);
      return;
    }
    const destination = typeof location.state?.from === "string" ? location.state.from : "/";
    navigate(destination, { replace: true });
  }

  async function handleLocalTestSubmit(e: FormEvent) {
    e.preventDefault();
    setLocalSubmitting(true);
    setLocalError(null);
    const failureMessage = await loginForLocalTesting(localUsername, localPassword);
    setLocalSubmitting(false);
    if (failureMessage) {
      setLocalError(failureMessage);
      return;
    }
    navigate("/admin", { replace: true });
  }

  return (
    <main className="page">
      <h1>Log In</h1>
      <form onSubmit={handleSubmit} className="form">
        <label>
          Email
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </label>
        <label>
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>
        <p className="form-link"><Link to="/forgot-password">Forgot password?</Link></p>
        {error && <p className="error">{error}</p>}
        <button type="submit" disabled={submitting}>
          {submitting ? "Logging in..." : "Log In"}
        </button>
      </form>
      <p>
        Need an account? <Link to="/signup">Sign up</Link>
      </p>
      {import.meta.env.DEV && (
        <section className="local-test-login">
          <h2>Local sheet testing</h2>
          <p className="note">
            Uses a local login and an admin session that is not saved as a user
            in the sheet. Admin changes here affect the connected live sheet.
          </p>
          <form onSubmit={handleLocalTestSubmit} className="form">
            <label>
              Local username
              <input
                value={localUsername}
                onChange={(e) => setLocalUsername(e.target.value)}
                autoComplete="username"
                required
              />
            </label>
            <label>
              Local password
              <input
                type="password"
                value={localPassword}
                onChange={(e) => setLocalPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
            </label>
            {localError && <p className="error">{localError}</p>}
            <button type="submit" disabled={localSubmitting}>
              {localSubmitting ? "Connecting..." : "Open local test flow"}
            </button>
          </form>
        </section>
      )}
    </main>
  );
}
