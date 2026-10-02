import type { Role } from "../config/roles";
import type { WindowName } from "../config/schedulingRules";
import type {
  AdminActionResult,
  AdminListVacationsResult,
  AdminListSlotsResult,
  AdminListUsersResult,
} from "../types/admin";
import type { AuthResult } from "../types/auth";
import type { VacationSession } from "../types/vacations";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "/api";

function authHeaders(token: string) {
  return { Authorization: `Bearer ${token}` };
}

export async function adminLogin(password: string): Promise<AuthResult> {
  const res = await fetch(`${API_BASE}/admin/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
  });
  return res.json();
}

export async function listAdminUsers(token: string, role?: Role): Promise<AdminListUsersResult> {
  const params = new URLSearchParams();
  if (role) params.set("role", role);
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

export async function listAdminVacations(
  token: string,
  role?: Role,
  startDate?: string,
  days?: number,
): Promise<AdminListVacationsResult> {
  const params = new URLSearchParams();
  if (role) params.set("role", role);
  if (startDate) params.set("startDate", startDate);
  if (days) params.set("days", String(days));

  const res = await fetch(`${API_BASE}/admin/vacations?${params.toString()}`, {
    headers: authHeaders(token),
  });
  return res.json();
}

export async function createAdminVacation(
  token: string,
  email: string,
  startDate: string,
  endDate: string,
  session: VacationSession,
  note: string,
): Promise<AdminActionResult> {
  const res = await fetch(`${API_BASE}/admin/vacations`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders(token) },
    body: JSON.stringify({ email, startDate, endDate, session, note }),
  });
  return res.json();
}

export async function updateAdminVacation(
  token: string,
  vacationId: string,
  startDate: string,
  endDate: string,
  session: VacationSession,
  note: string,
): Promise<AdminActionResult> {
  const res = await fetch(`${API_BASE}/admin/vacations/${encodeURIComponent(vacationId)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...authHeaders(token) },
    body: JSON.stringify({ startDate, endDate, session, note }),
  });
  return res.json();
}

export async function deleteAdminVacation(token: string, vacationId: string): Promise<AdminActionResult> {
  const res = await fetch(`${API_BASE}/admin/vacations/${encodeURIComponent(vacationId)}`, {
    method: "DELETE",
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
  recurrenceEndDate?: string,
): Promise<AdminActionResult> {
  const res = await fetch(`${API_BASE}/admin/assign`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders(token) },
    body: JSON.stringify({ date, window, role, email, ...(recurrenceEndDate ? { recurrenceEndDate } : {}) }),
  });
  return res.json();
}

export async function localTestLogin(username: string, password: string): Promise<AuthResult> {
  const res = await fetch(`${API_BASE}/admin/local-test-login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  return res.json();
}

export async function notifyBookingSeries(
  token: string,
  date: string,
  window: WindowName,
  role: Role,
  email: string,
  recurrenceEndDate: string,
): Promise<AdminActionResult> {
  const res = await fetch(`${API_BASE}/admin/assign/notify-series`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders(token) },
    body: JSON.stringify({ date, window, role, email, recurrenceEndDate }),
  });
  return res.json();
}

export async function unassignSlot(
  token: string,
  date: string,
  window: WindowName,
  role: Role,
  email?: string,
): Promise<AdminActionResult> {
  const res = await fetch(`${API_BASE}/admin/unassign`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders(token) },
    body: JSON.stringify({ date, window, role, ...(email ? { email } : {}) }),
  });
  return res.json();
}
