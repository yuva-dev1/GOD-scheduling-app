export interface Vacation {
  vacationId: string;
  startDate: string;
  endDate: string;
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
