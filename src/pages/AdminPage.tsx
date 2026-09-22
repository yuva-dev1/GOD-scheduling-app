import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../features/auth/AuthContext";
import { ROLE_LABELS, SELF_SERVE_ROLES, type Role } from "../config/roles";
import { formatDate, type WindowName } from "../config/schedulingRules";
import { assignSlot, listAdminSlots, listAdminUsers, unassignSlot } from "../services/adminApi";
import type { AdminSlot, AdminUser } from "../types/admin";

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DAYS_TO_SHOW = 14;

function slotKey(date: string, window: WindowName) {
  return `${date}|${window}`;
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

  async function handleUnassign(slot: AdminSlot) {
    if (!token) return;
    setPending(slotKey(slot.date, slot.window));
    setError(null);
    const result = await unassignSlot(token, slot.date, slot.window, role);
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
            {ROLE_LABELS[r]}
          </button>
        ))}
      </div>

      {error && <p className="error">{error}</p>}
      {loading && <p>Loading...</p>}

      {!loading && dates.length === 0 && <p>No open days for this role right now.</p>}

      {!loading && dates.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Morning</th>
              <th>Evening</th>
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
                    if (!slot) return <td key={window}>—</td>;
                    const key = slotKey(slot.date, slot.window);
                    const isPending = pending === key;
                    return (
                      <td key={window}>
                        <div>
                          {slot.start}–{slot.end}
                        </div>
                        {slot.status === "booked" ? (
                          <>
                            <div className="note">{slot.assignedEmail}</div>
                            <button type="button" disabled={isPending} onClick={() => handleUnassign(slot)}>
                              {isPending ? "..." : "Unassign"}
                            </button>
                          </>
                        ) : (
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
                              disabled={isPending || !selectedEmail[key]}
                              onClick={() => handleAssign(slot)}
                            >
                              {isPending ? "..." : "Assign"}
                            </button>
                          </div>
                        )}
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
