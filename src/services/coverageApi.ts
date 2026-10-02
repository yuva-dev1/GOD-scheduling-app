import type { CoverageListResult } from "../types/coverage";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "/api";

export async function listCoverage(
  token: string,
  startDate?: string,
  days?: number,
): Promise<CoverageListResult> {
  const params = new URLSearchParams();
  if (startDate) params.set("startDate", startDate);
  if (days) params.set("days", String(days));

  const res = await fetch(`${API_BASE}/slots/coverage?${params.toString()}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.json();
}
