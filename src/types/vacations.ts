export type VacationSession = "full_day" | "morning" | "evening";

export interface Vacation {
  vacationId: string;
  startDate: string;
  endDate: string;
  email?: string;
  role?: string;
  session: VacationSession;
  note: string;
}

export interface VacationListResult {
  success: boolean;
  vacations?: Vacation[];
  message?: string;
}

export interface VacationActionResult {
  success: boolean;
  vacation?: Vacation;
  clearedAssignmentCount?: number;
  message?: string;
}
