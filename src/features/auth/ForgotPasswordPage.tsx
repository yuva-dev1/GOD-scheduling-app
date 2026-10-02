import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { requestPasswordReset } from "../../services/authApi";
import { isValidEmail } from "../../lib/validation";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    if (!isValidEmail(email)) {
      setError("Enter a valid email address.");
      return;
    }

    setSubmitting(true);
    try {
      const result = await requestPasswordReset(email);
      if (!result.success) {
        setError(result.message ?? "Unable to process the request. Please try again.");
      } else {
        setMessage(result.message ?? "If an account exists for that email, password reset instructions will be sent shortly.");
      }
    } catch {
      setError("Unable to process the request right now. Please try again later.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="page">
      <h1>Reset your password</h1>
      <p className="subtitle">Enter the email address on your account. If it matches an account, we’ll send a one-time reset link.</p>
      <form onSubmit={handleSubmit} className="form">
        <label>
          Email
          <input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
        </label>
        {error && <p className="error" role="alert">{error}</p>}
        {message && <p className="success-message" role="status">{message}</p>}
        <button type="submit" disabled={submitting}>{submitting ? "Sending…" : "Send reset link"}</button>
      </form>
      <p><Link to="/login">Return to log in</Link></p>
    </main>
  );
}
