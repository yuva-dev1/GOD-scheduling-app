import { ROLES, type Role } from "./roles";

export type DayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6; // JS Date#getDay(): 0 = Sunday

export const WEEKDAY_DAYS: DayOfWeek[] = [1, 2, 3, 4, 5]; // Mon-Fri
export const WEEKEND_DAYS: DayOfWeek[] = [0, 6]; // Sun, Sat

// Days Tirtha Kainkaryam may be scheduled on: Friday, Saturday, Sunday only.
export const TIRTHA_ALLOWED_DAYS: DayOfWeek[] = [5, 6, 0];

export interface TimeWindow {
  /** "HH:MM" 24-hour, inclusive start. */
  start: string;
  /** "HH:MM" 24-hour, exclusive end. */
  end: string;
}

export interface DaySchedule {
  morning: TimeWindow;
  evening: TimeWindow;
}

export const WEEKDAY_SCHEDULE: DaySchedule = {
  morning: { start: "06:00", end: "11:00" },
  evening: { start: "16:00", end: "21:00" },
};

export const WEEKEND_SCHEDULE: DaySchedule = {
  morning: { start: "08:00", end: "12:00" },
  evening: { start: "19:00", end: "21:00" },
};

export function isWeekend(day: DayOfWeek): boolean {
  return day === 0 || day === 6;
}

export function scheduleForDay(day: DayOfWeek): DaySchedule {
  return isWeekend(day) ? WEEKEND_SCHEDULE : WEEKDAY_SCHEDULE;
}

export function isRoleEligibleOnDay(role: Role, day: DayOfWeek): boolean {
  if (role === ROLES.TIRTHA_KAINKARYAM) {
    return TIRTHA_ALLOWED_DAYS.includes(day);
  }
  // Pirumar kainkaryam and admin-managed slots are open every day.
  return true;
}

/**
 * Returns the open windows for a role on a given day, or an empty array if
 * the role cannot be scheduled that day (e.g. Tirtha Kainkaryam on a Tuesday).
 */
export function windowsForRoleOnDay(role: Role, day: DayOfWeek): TimeWindow[] {
  if (!isRoleEligibleOnDay(role, day)) {
    return [];
  }
  const schedule = scheduleForDay(day);
  return [schedule.morning, schedule.evening];
}
