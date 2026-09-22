import { Link } from "react-router-dom";
import { useAuth } from "../features/auth/AuthContext";
import { ROLE_LABELS, ROLES } from "../config/roles";

export default function NavBar() {
  const { user, logout } = useAuth();
  if (!user) return null;

  const isAdmin = user.role === ROLES.ADMIN;

  return (
    <nav className="navbar">
      <Link to="/">Home</Link>
      {isAdmin ? <Link to="/admin">Admin</Link> : <Link to="/schedule">Schedule</Link>}
      <span className="navbar-spacer" />
      <span>{isAdmin ? "Admin" : `${user.email} (${ROLE_LABELS[user.role]})`}</span>
      <button type="button" onClick={logout}>
        Log out
      </button>
    </nav>
  );
}
