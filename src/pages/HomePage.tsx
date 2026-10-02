import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../features/auth/AuthContext";
import { hasAdminPermissions, ROLE_LABELS, ROLES, SELF_SERVE_ROLES, type Role } from "../config/roles";
import { FRIDAY_SCHEDULE, WEEKDAY_SCHEDULE, WEEKEND_SCHEDULE } from "../config/schedulingRules";

type ApiStatus = "checking" | "ok" | "unreachable";

function useApiStatus(): ApiStatus {
  const [status, setStatus] = useState<ApiStatus>("checking");

  useEffect(() => {
    const base = import.meta.env.VITE_API_BASE_URL ?? "/api";
    fetch(`${base}/health`)
      .then((res) => setStatus(res.ok ? "ok" : "unreachable"))
      .catch(() => setStatus("unreachable"));
  }, []);

  return status;
}

export default function HomePage() {
  const apiStatus = useApiStatus();
  const { user, changeRole, deleteAccount } = useAuth();
  const isAdmin = hasAdminPermissions(user?.role);
  const [roleChoice, setRoleChoice] = useState<Role>(() => user?.role ?? SELF_SERVE_ROLES[0]);
  const [changingRole, setChangingRole] = useState(false);
  const [roleError, setRoleError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function handleDeleteAccount() {
    if (!window.confirm("Delete this account permanently? Your password, assignments, and vacations will be removed.")) {
      return;
    }
    setDeleting(true);
    setDeleteError(null);
    try {
      const error = await deleteAccount();
      if (!error) return;
      setDeleteError(error);
    } catch {
      setDeleteError("The account could not be deleted. Please try again.");
    } finally {
      setDeleting(false);
    }
  }

  async function handleRoleChange() {
    if (!user || roleChoice === user.role) return;
    const nextRole = ROLE_LABELS[roleChoice];
    if (!window.confirm(`Switch your Kainkaryam to ${nextRole}? Existing assignments will be cleared; vacation dates will be kept.`)) {
      return;
    }
    setChangingRole(true);
    setRoleError(null);
    try {
      const error = await changeRole(roleChoice);
      if (error) setRoleError(error);
    } catch {
      setRoleError("The Kainkaryam could not be changed. Please try again.");
    } finally {
      setChangingRole(false);
    }
  }

  return (
    <main className="page">
      <h1>Kainkaryam Scheduler</h1>
      <p className="subtitle">
        {isAdmin && <>Head to <Link to="/admin">Admin</Link> to manage open slots.</>}
        {user?.role !== ROLES.ADMIN && (
          <> Head to <Link to="/schedule">Schedule</Link> to book or cancel a slot.</>
        )}
      </p>

      <section>
        <h2>Roles</h2>
        <ul>
          {SELF_SERVE_ROLES.map((role) => (
            <li key={role}>{ROLE_LABELS[role]}</li>
          ))}
          <li>{ROLE_LABELS.admin} (shared-password access)</li>
        </ul>
      </section>

      <section>
        <h2>Open Hours</h2>
        <table>
          <thead>
            <tr>
              <th>Days</th>
              <th>Morning</th>
              <th>Evening</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Mon–Thu</td>
              <td>AM</td>
              <td>
                {WEEKDAY_SCHEDULE.evening.start}–{WEEKDAY_SCHEDULE.evening.end}
              </td>
            </tr>
            <tr>
              <td>Fri</td>
              <td>AM (Perumal only)</td>
              <td>
                {FRIDAY_SCHEDULE.evening.start}–{FRIDAY_SCHEDULE.evening.end}
              </td>
            </tr>
            <tr>
              <td>Sat–Sun</td>
              <td>
                {WEEKEND_SCHEDULE.morning.start}–{WEEKEND_SCHEDULE.morning.end}
              </td>
              <td>
                {WEEKEND_SCHEDULE.evening.start}–{WEEKEND_SCHEDULE.evening.end}
              </td>
            </tr>
          </tbody>
        </table>
        <p className="note">
          Times are shown in 24-hour format. Tirtha Kainkaryam is open Friday
          evening and Saturday/Sunday morning and evening; Friday morning is
          Perumal-only.
        </p>
      </section>

      <p className="status">
        API status: <span className={`status-${apiStatus}`}>{apiStatus}</span>
      </p>

      {user?.role !== ROLES.ADMIN && (
        <>
          <section className="account-settings" aria-labelledby="kainkaryam-heading">
            <p className="eyebrow">Account settings</p>
            <h2 id="kainkaryam-heading">Kainkaryam</h2>
            <p className="note">
              Change between Perumal and Tirtha Kainkaryam. Your vacation dates stay in place, but existing assignments are cleared because they belong to the previous service.
            </p>
            <div className="account-setting-row">
              <label htmlFor="kainkaryam-role">Desired Kainkaryam</label>
              <select
                id="kainkaryam-role"
                value={roleChoice}
                disabled={changingRole}
                onChange={(event) => setRoleChoice(event.target.value as Role)}
              >
                {SELF_SERVE_ROLES.map((role) => (
                  <option key={role} value={role}>{ROLE_LABELS[role]}</option>
                ))}
              </select>
              <button
                type="button"
                className="primary-button compact"
                disabled={changingRole || roleChoice === user?.role}
                onClick={handleRoleChange}
              >
                {changingRole ? "Changing..." : "Change Kainkaryam"}
              </button>
            </div>
            {roleError && <p className="error" role="alert">{roleError}</p>}
          </section>

          <section className="danger-zone" aria-labelledby="delete-account-heading">
            <p className="eyebrow">Account settings</p>
            <h2 id="delete-account-heading">Delete account</h2>
            <p className="note">
              This permanently removes your account and password, assignments, and vacation ranges from the scheduler.
            </p>
            {deleteError && <p className="error" role="alert">{deleteError}</p>}
            <button type="button" className="danger-button" disabled={deleting} onClick={handleDeleteAccount}>
              {deleting ? "Deleting account..." : "Delete account"}
            </button>
          </section>
        </>
      )}
    </main>
  );
}
