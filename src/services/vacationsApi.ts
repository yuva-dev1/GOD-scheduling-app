import type {
  VacationActionResult,
  VacationListResult,
  VacationSession,
} from "../types/vacations";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "/api";

function authHeaders(token: string) {
  return { Authorization: `Bearer ${token}` };
}

export async function listVacations(token: string): Promise<VacationListResult> {
  const res = await fetch(`${API_BASE}/vacations`, { headers: authHeaders(token) });
  return res.json();
}

export async function createVacation(
  token: string,
  startDate: string,
  endDate: string,
  session: VacationSession,
  note: string,
): Promise<VacationActionResult> {
  const res = await fetch(`${API_BASE}/vacations`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders(token) },
    body: JSON.stringify({ startDate, endDate, session, note }),
  });
  return res.json();
}

export async function deleteVacation(token: string, vacationId: string): Promise<VacationActionResult> {
  const res = await fetch(`${API_BASE}/vacations/${encodeURIComponent(vacationId)}`, {
    method: "DELETE",
    headers: authHeaders(token),
  });
  return res.json();
}
