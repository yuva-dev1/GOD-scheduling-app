import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../features/auth/AuthContext";
import { ROLE_LABELS, ROLES, SELF_SERVE_ROLES, type Role } from "../config/roles";
import { formatDate, type WindowName } from "../config/schedulingRules";
import { assignSlot, listAdminSlots, listAdminUsers, unassignSlot } from "../services/adminApi";
import type { AdminSlot, AdminUser } from "../types/admin";

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DAYS_TO_SHOW = 14;

const ROLE_INDICATORS: Record<Role, { icon: string; className: string; description: string }> = {
  [ROLES.PERUMAL_KAINKARYAM]: {
    icon: "🛕",
    className: "role-perumal",
    description: "Perumal service",
  },
  [ROLES.TIRTHA_KAINKARYAM]: {
    icon: "💧",
    className: "role-tirtha",
    description: "Tirtha service",
  },
  [ROLES.ADMIN]: {
    icon: "⚙",
    className: "role-admin",
    description: "Administrator",
  },
};

function slotKey(date: string, window: WindowName) {
  return `${date}|${window}`;
}

function assignmentKey(slot: AdminSlot, email: string) {
  return `${slotKey(slot.date, slot.window)}|${email}`;
}

function displaySlotTime(window: WindowName, start: string, end: string) {
  if (window === "morning") return "AM";
  return `${start}–${end}`;
}

export default function AdminPage() {
  const { token } = useAuth();
  const [role, setRole] = useState<Role>(SELF_SERVE_ROLES[0]);
  const [slots, setSlots] = useState<AdminSlot[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [selectedEmail, setSelectedEmail] = useState<Record<string, string>>({});

  const refresh = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    const [slotsResult, usersResult] = await Promise.all([
      listAdminSlots(token, role, formatDate(new Date()), DAYS_TO_SHOW),
      listAdminUsers(token, role),
    ]);
    setLoading(false);
    if (!slotsResult.success || !slotsResult.slots) {
      setError(slotsResult.message ?? "Could not load slots");
      return;
    }
    setSlots(slotsResult.slots);
    setUsers(usersResult.users ?? []);
  }, [token, role]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function handleAssign(slot: AdminSlot) {
    if (!token) return;
    const email = selectedEmail[slotKey(slot.date, slot.window)];
    if (!email) return;
    setPending(slotKey(slot.date, slot.window));
    setError(null);
    const result = await assignSlot(token, slot.date, slot.window, role, email);
    setPending(null);
    if (!result.success) {
      setError(result.message ?? "Assignment failed");
      return;
    }
    refresh();
  }

  async function handleUnassign(slot: AdminSlot, email: string) {
    if (!token) return;
    setPending(assignmentKey(slot, email));
    setError(null);
    const result = await unassignSlot(token, slot.date, slot.window, role, email);
    setPending(null);
    if (!result.success) {
      setError(result.message ?? "Unassign failed");
      return;
    }
    refresh();
  }

  const dates = [...new Set(slots.map((s) => s.date))];

  return (
    <main className="page">
      <h1>Admin</h1>
      <p className="subtitle">Assign people into open slots, or free up a booked one.</p>

      <div className="role-tabs">
        {SELF_SERVE_ROLES.map((r) => (
          <button
            key={r}
            type="button"
            className={r === role ? "active" : ""}
            onClick={() => setRole(r)}
          >
            <span className={`role-icon ${ROLE_INDICATORS[r].className}`} aria-hidden="true">
              {ROLE_INDICATORS[r].icon}
            </span>
            <span>{ROLE_LABELS[r]}</span>
          </button>
        ))}
      </div>

      <div className={`admin-role-context ${ROLE_INDICATORS[role].className}`}>
        <span className="role-icon" aria-hidden="true">{ROLE_INDICATORS[role].icon}</span>
        <div>
          <strong>{ROLE_LABELS[role]}</strong>
          <span>{ROLE_INDICATORS[role].description} schedule</span>
        </div>
      </div>

      {error && <p className="error">{error}</p>}
      {loading && <p>Loading...</p>}

      {!loading && dates.length === 0 && <p>No open days for this role right now.</p>}

      {!loading && dates.length > 0 && (
        <table>
          <thead>
            <tr>
              <th rowSpan={2}>Date</th>
              <th className="period-heading period-am">AM</th>
              <th className="period-heading period-pm">PM</th>
            </tr>
            <tr>
              <th className="period-label period-am">Morning</th>
              <th className="period-label period-pm">Evening</th>
            </tr>
          </thead>
          <tbody>
            {dates.map((date) => {
              const daySlots = slots.filter((s) => s.date === date);
              const day = daySlots[0].day;
              return (
                <tr key={date}>
                  <td>
                    {DAY_NAMES[day]} {date}
                  </td>
                  {(["morning", "evening"] as WindowName[]).map((window) => {
                    const slot = daySlots.find((s) => s.window === window);
                    const periodClass = window === "morning" ? "period-am" : "period-pm";
                    if (!slot) return <td key={window} className={periodClass}>—</td>;
                    const key = slotKey(slot.date, slot.window);
                    const isAssignPending = pending === key;
                    const assignedEmails = slot.assignedEmails ??
                      (slot.assignedEmail ? [slot.assignedEmail] : []);
                    return (
                      <td key={window} className={periodClass}>
                        <div>
                          {displaySlotTime(slot.window, slot.start, slot.end)}
                        </div>
                        {assignedEmails.length > 0 && (
                          <div className="assignment-list">
                            {assignedEmails.map((email) => {
                              const isUnassignPending = pending === assignmentKey(slot, email);
                              return (
                                <div className="assignment-row" key={email}>
                                  <span className="note">{email}</span>
                                  <button
                                    type="button"
                                    disabled={isUnassignPending || isAssignPending}
                                    onClick={() => handleUnassign(slot, email)}
                                  >
                                    {isUnassignPending ? "..." : "Unassign"}
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                        )}
                        <div className="assign-row">
                          <select
                            value={selectedEmail[key] ?? ""}
                            onChange={(e) =>
                              setSelectedEmail((prev) => ({ ...prev, [key]: e.target.value }))
                            }
                          >
                            <option value="">Select person...</option>
                            {users.map((u) => (
                              <option key={u.userId} value={u.email}>
                                {u.email}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            disabled={isAssignPending || !selectedEmail[key]}
                            onClick={() => handleAssign(slot)}
                          >
                            {isAssignPending ? "..." : "Assign"}
                          </button>
                        </div>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </main>
  );
}
