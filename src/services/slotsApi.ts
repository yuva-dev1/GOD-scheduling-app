import type { WindowName } from "../config/schedulingRules";
import type { ListSlotsResult, SlotActionResult } from "../types/slots";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "/api";

export async function listSlots(
  token: string,
  startDate?: string,
  days?: number,
): Promise<ListSlotsResult> {
  const params = new URLSearchParams();
  if (startDate) params.set("startDate", startDate);
  if (days) params.set("days", String(days));

  const res = await fetch(`${API_BASE}/slots?${params.toString()}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.json();
}

async function postSlotAction(
  path: "book" | "cancel",
  token: string,
  date: string,
  window: WindowName,
): Promise<SlotActionResult> {
  const res = await fetch(`${API_BASE}/slots/${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ date, window }),
  });
  return res.json();
}

export function bookSlot(token: string, date: string, window: WindowName) {
  return postSlotAction("book", token, date, window);
}

export function cancelSlot(token: string, date: string, window: WindowName) {
  return postSlotAction("cancel", token, date, window);
}
