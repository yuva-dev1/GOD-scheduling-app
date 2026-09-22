import type { ReactNode } from "react";
import { ROLES } from "../../config/roles";
import { useAuth } from "./AuthContext";
import AdminPasswordGate from "./AdminPasswordGate";

// /admin is reachable by anyone (no account/login required) and is gated
// entirely by AdminPasswordGate's shared password, not by AuthContext's
// per-user session — a signed-in Perumal/Tirtha volunteer hitting this
// route sees the password gate too, same as a logged-out visitor.
export default function AdminRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <main className="page">
        <p>Loading...</p>
      </main>
    );
  }

  if (!user || user.role !== ROLES.ADMIN) {
    return <AdminPasswordGate />;
  }

  return <>{children}</>;
}
