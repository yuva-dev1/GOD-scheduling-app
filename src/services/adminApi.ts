import type { Role } from "../config/roles";
import type { WindowName } from "../config/schedulingRules";
import type {
  AdminActionResult,
  AdminListSlotsResult,
  AdminListUsersResult,
} from "../types/admin";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "/api";

function authHeaders(token: string) {
  return { Authorization: `Bearer ${token}` };
}

export async function listAdminUsers(token: string, role: Role): Promise<AdminListUsersResult> {
  const params = new URLSearchParams({ role });
  const res = await fetch(`${API_BASE}/admin/users?${params.toString()}`, {
    headers: authHeaders(token),
  });
  return res.json();
}

export async function listAdminSlots(
  token: string,
  role: Role,
  startDate?: string,
  days?: number,
): Promise<AdminListSlotsResult> {
  const params = new URLSearchParams({ role });
  if (startDate) params.set("startDate", startDate);
  if (days) params.set("days", String(days));

  const res = await fetch(`${API_BASE}/admin/slots?${params.toString()}`, {
    headers: authHeaders(token),
  });
  return res.json();
}

export async function assignSlot(
  token: string,
  date: string,
  window: WindowName,
  role: Role,
  email: string,
): Promise<AdminActionResult> {
  const res = await fetch(`${API_BASE}/admin/assign`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders(token) },
    body: JSON.stringify({ date, window, role, email }),
  });
  return res.json();
}

export async function unassignSlot(
  token: string,
  date: string,
  window: WindowName,
  role: Role,
): Promise<AdminActionResult> {
  const res = await fetch(`${API_BASE}/admin/unassign`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders(token) },
    body: JSON.stringify({ date, window, role }),
  });
  return res.json();
}
