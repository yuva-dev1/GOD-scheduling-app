import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../features/auth/AuthContext";
import { ROLE_LABELS, ROLES, SELF_SERVE_ROLES } from "../config/roles";
import {
  TIRTHA_ALLOWED_DAYS,
  FRIDAY_SCHEDULE,
  WEEKDAY_SCHEDULE,
  WEEKEND_SCHEDULE,
} from "../config/schedulingRules";

type ApiStatus = "checking" | "ok" | "unreachable";

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

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
  const { user } = useAuth();
  const isAdmin = user?.role === ROLES.ADMIN;

  return (
    <main className="page">
      <h1>Kainkaryam Scheduler</h1>
      <p className="subtitle">
        {isAdmin ? (
          <>
            Head to <Link to="/admin">Admin</Link> to assign people into open slots.
          </>
        ) : (
          <>
            Head to <Link to="/schedule">Schedule</Link> to book or cancel a slot.
          </>
        )}
      </p>

      <section>
        <h2>Roles</h2>
        <ul>
          {SELF_SERVE_ROLES.map((role) => (
            <li key={role}>{ROLE_LABELS[role]}</li>
          ))}
          <li>{ROLE_LABELS.admin} (assigned, not self-serve)</li>
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
              <td>AM</td>
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
          Times are shown in 24-hour format. Tirtha Kainkaryam is only open on{" "}
          {TIRTHA_ALLOWED_DAYS.map((d) => DAY_NAMES[d]).join(", ")}.
        </p>
      </section>

      <p className="status">
        API status: <span className={`status-${apiStatus}`}>{apiStatus}</span>
      </p>
    </main>
  );
}
