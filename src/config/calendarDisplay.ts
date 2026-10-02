import { formatDate } from "./schedulingRules";

export const MAX_DISPLAY_DATE = "2027-01-31";
export const MAX_DISPLAY_MONTH = new Date("2027-01-01T12:00:00");

export function todayDate(): string {
  return formatDate(new Date());
}

export function isDisplayDate(date: string): boolean {
  return date >= todayDate() && date <= MAX_DISPLAY_DATE;
}

export function isMonthBefore(first: Date, second: Date): boolean {
  return first.getFullYear() < second.getFullYear() || (
    first.getFullYear() === second.getFullYear() && first.getMonth() < second.getMonth()
  );
}

export function isMonthAfter(first: Date, second: Date): boolean {
  return isMonthBefore(second, first);
}
