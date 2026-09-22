import type { WindowName } from "../config/schedulingRules";
import type { Role } from "../config/roles";

export interface AdminSlot {
  date: string;
  day: number;
  window: WindowName;
  start: string;
  end: string;
  status: "open" | "booked";
  assignedEmail: string | null;
}

export interface AdminUser {
  userId: string;
  email: string;
  role: Role;
}

export interface AdminListSlotsResult {
  success: boolean;
  slots?: AdminSlot[];
  message?: string;
}

export interface AdminListUsersResult {
  success: boolean;
  users?: AdminUser[];
  message?: string;
}

export interface AdminActionResult {
  success: boolean;
  message?: string;
}
