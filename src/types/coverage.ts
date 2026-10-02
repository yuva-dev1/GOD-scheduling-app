import type { Role } from "../config/roles";
import type { WindowName } from "../config/schedulingRules";
import type { AdminAssignment, AdminVacation } from "./admin";

export interface CoverageSlot {
  date: string;
  day: number;
  window: WindowName;
  role: Role;
  start: string;
  end: string;
  status: "open" | "booked";
  assignedCount: number;
  assignedEmails: string[];
  assignedAssignments: AdminAssignment[];
}

export interface CoverageListResult {
  success: boolean;
  slots?: CoverageSlot[];
  vacations?: AdminVacation[];
  /** Total active Perumal volunteers, used for the shared R/Y/G indicator. */
  perumalUserCount?: number;
  message?: string;
}
