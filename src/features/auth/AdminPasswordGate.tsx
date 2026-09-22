import { useState, type FormEvent } from "react";
import { useAuth } from "./AuthContext";

export default function AdminPasswordGate() {
  const { loginAsAdmin } = useAuth();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const failureMessage = await loginAsAdmin(password);
    setSubmitting(false);
    if (failureMessage) {
      setError(failureMessage);
      setPassword("");
      return;
    }
  }

  return (
    <main className="page">
      <h1>Admin</h1>
      <p className="subtitle">Enter the admin password to continue.</p>
      <form onSubmit={handleSubmit} className="form">
        <label>
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
            required
          />
        </label>
        {error && <p className="error">{error}</p>}
        <button type="submit" disabled={submitting}>
          {submitting ? "Checking..." : "Continue"}
        </button>
      </form>
    </main>
  );
}
