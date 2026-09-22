import { Link } from "react-router-dom";
import { useAuth } from "../features/auth/AuthContext";
import { ROLE_LABELS } from "../config/roles";

export default function NavBar() {
  const { user, logout } = useAuth();
  if (!user) return null;

  return (
    <nav className="navbar">
      <Link to="/">Home</Link>
      <Link to="/schedule">Schedule</Link>
      <span className="navbar-spacer" />
      <span>
        {user.email} ({ROLE_LABELS[user.role]})
      </span>
      <button type="button" onClick={logout}>
        Log out
      </button>
    </nav>
  );
}
