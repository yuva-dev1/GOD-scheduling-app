import { Link } from "react-router-dom";
import { useAuth } from "../features/auth/AuthContext";
import { hasAdminPermissions, ROLE_LABELS, ROLES, SELF_SERVE_ROLES } from "../config/roles";

export default function NavBar() {
  const { user, logout } = useAuth();
  if (!user) return null;

  const isAdmin = hasAdminPermissions(user.role);
  const isSelfServe = SELF_SERVE_ROLES.includes(user.role);

  return (
    <nav className="navbar">
      <Link to="/">Home</Link>
      {isSelfServe && <Link to="/schedule">Schedule</Link>}
      {isAdmin && <Link to="/admin">Admin</Link>}
      <span className="navbar-spacer" />
      <span>{user.role === ROLES.ADMIN ? "Admin" : `${user.email} (${ROLE_LABELS[user.role]})`}</span>
      <button type="button" onClick={logout}>
        Log out
      </button>
    </nav>
  );
}
