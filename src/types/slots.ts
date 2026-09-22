import type { WindowName } from "../config/schedulingRules";

export interface Slot {
  date: string;
  day: number;
  window: WindowName;
  start: string;
  end: string;
  status: "open" | "booked";
  bookedCount: number;
  bookedByMe: boolean;
}

export interface ListSlotsResult {
  success: boolean;
  slots?: Slot[];
  message?: string;
}

export interface SlotActionResult {
  success: boolean;
  message?: string;
}
