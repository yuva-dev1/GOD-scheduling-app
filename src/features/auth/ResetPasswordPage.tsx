import { useEffect, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { completePasswordReset } from "../../services/authApi";
import { isValidPassword } from "../../lib/validation";

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const [token] = useState(() => searchParams.get("token") ?? "");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (token) window.history.replaceState(window.history.state, "", window.location.pathname);
  }, [token]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    if (!token) {
      setError("This reset link is missing or invalid. Request a new one to continue.");
      return;
    }
    if (!isValidPassword(password)) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("The passwords do not match.");
      return;
    }

    setSubmitting(true);
    try {
      const result = await completePasswordReset(token, password);
      if (result.success) {
        setMessage(result.message ?? "Your password has been updated. You can now log in.");
        setPassword("");
        setConfirmPassword("");
      } else {
        setError(result.message ?? "This reset link is invalid or expired. Request a new one to continue.");
      }
    } catch {
      setError("Unable to reset your password right now. Please try again later.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="page">
      <h1>Choose a new password</h1>
      <p className="subtitle">Use at least 8 characters. Reset links expire after one hour and work once.</p>
      <form onSubmit={handleSubmit} className="form">
        <label>
          New password
          <input type="password" autoComplete="new-password" minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} required />
        </label>
        <label>
          Confirm new password
          <input type="password" autoComplete="new-password" minLength={8} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} required />
        </label>
        {error && <p className="error" role="alert">{error}</p>}
        {message && <p className="success-message" role="status">{message}</p>}
        <button type="submit" disabled={submitting || !token || Boolean(message)}>{submitting ? "Updating…" : "Update password"}</button>
      </form>
      <p><Link to={message ? "/login" : "/forgot-password"}>{message ? "Log in" : "Request a new reset link"}</Link></p>
    </main>
  );
}
