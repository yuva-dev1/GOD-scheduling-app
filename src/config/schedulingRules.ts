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

// Monday-Thursday schedule. Friday has its own evening window below.
export const WEEKDAY_SCHEDULE: DaySchedule = {
  morning: { start: "06:00", end: "11:00" },
  evening: { start: "16:00", end: "21:00" },
};

export const FRIDAY_SCHEDULE: DaySchedule = {
  morning: { start: "06:00", end: "11:00" },
  evening: { start: "18:15", end: "20:15" },
};

export const WEEKEND_SCHEDULE: DaySchedule = {
  morning: { start: "08:45", end: "13:15" },
  evening: { start: "17:45", end: "20:15" },
};

export function isWeekend(day: DayOfWeek): boolean {
  return day === 0 || day === 6;
}

export function scheduleForDay(day: DayOfWeek): DaySchedule {
  if (day === 5) return FRIDAY_SCHEDULE;
  return isWeekend(day) ? WEEKEND_SCHEDULE : WEEKDAY_SCHEDULE;
}

export function isRoleEligibleOnDay(role: Role, day: DayOfWeek): boolean {
  if (role === ROLES.TIRTHA_KAINKARYAM) {
    return TIRTHA_ALLOWED_DAYS.includes(day);
  }
  // Perumal kainkaryam and admin-managed slots are open every day.
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

export type WindowName = "morning" | "evening";

export interface SlotDescriptor extends TimeWindow {
  /** "YYYY-MM-DD", using the calendar date of `from`'s local timezone. */
  date: string;
  day: DayOfWeek;
  window: WindowName;
}

/** Formats a Date as "YYYY-MM-DD" using local date parts (no UTC shift). */
export function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Generates the open (date, window) slots for a role starting at `from` for
 * `days` calendar days (inclusive of `from`). Pure/deterministic given
 * `from`, so both the frontend and Apps Script (which mirrors this logic in
 * apps-script/Slots.gs, since it can't import this module) can independently
 * derive the same slot set from just a date and role.
 */
export function generateUpcomingSlots(
  role: Role,
  days: number,
  from: Date = new Date(),
): SlotDescriptor[] {
  const slots: SlotDescriptor[] = [];
  for (let i = 0; i < days; i++) {
    const date = new Date(from.getFullYear(), from.getMonth(), from.getDate() + i);
    const day = date.getDay() as DayOfWeek;
    for (const [window, timeWindow] of Object.entries(scheduleForDay(day)) as [
      WindowName,
      TimeWindow,
    ][]) {
      if (!isRoleEligibleOnDay(role, day)) continue;
      slots.push({ date: formatDate(date), day, window, ...timeWindow });
    }
  }
  return slots;
}
