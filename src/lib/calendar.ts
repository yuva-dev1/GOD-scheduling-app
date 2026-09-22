import { formatDate, type DayOfWeek } from "../config/schedulingRules";

export interface CalendarDay {
  date: string;
  day: DayOfWeek;
  isCurrentMonth: boolean;
  isToday: boolean;
}

export function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

export function addCalendarMonths(date: Date, months: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + months, 1);
}

export function getCalendarDays(month: Date): CalendarDay[] {
  const firstOfMonth = startOfMonth(month);
  const gridStart = new Date(
    firstOfMonth.getFullYear(),
    firstOfMonth.getMonth(),
    1 - firstOfMonth.getDay(),
  );
  const today = formatDate(new Date());

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(
      gridStart.getFullYear(),
      gridStart.getMonth(),
      gridStart.getDate() + index,
    );
    return {
      date: formatDate(date),
      day: date.getDay() as DayOfWeek,
      isCurrentMonth: date.getMonth() === firstOfMonth.getMonth(),
      isToday: formatDate(date) === today,
    };
  });
}

export function calendarGridStart(month: Date): string {
  return getCalendarDays(month)[0].date;
}

export function monthLabel(month: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
  }).format(month);
}

export function shortDateLabel(date: string): string {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(new Date(`${date}T12:00:00`));
}

export function formatShortMonthDay(date: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(new Date(`${date}T12:00:00`));
}

export function rangeBetweenDates(startDate: string, endDate: string): string[] {
  const start = new Date(`${startDate}T12:00:00`);
  const end = new Date(`${endDate}T12:00:00`);
  const direction = start <= end ? 1 : -1;
  const days: string[] = [];
  const current = new Date(start);

  while (true) {
    days.push(formatDate(current));
    if (formatDate(current) === formatDate(end)) break;
    current.setDate(current.getDate() + direction);
  }

  return days;
}

export function addMonthsToDate(dateString: string, months: number): string {
  const source = new Date(`${dateString}T12:00:00`);
  const targetMonth = new Date(source.getFullYear(), source.getMonth() + months, 1);
  const lastDayOfTargetMonth = new Date(
    targetMonth.getFullYear(),
    targetMonth.getMonth() + 1,
    0,
  ).getDate();
  const target = new Date(
    targetMonth.getFullYear(),
    targetMonth.getMonth(),
    Math.min(source.getDate(), lastDayOfTargetMonth),
  );
  return formatDate(target);
}

export function weeklyDates(startDate: string, endDate: string): string[] {
  const start = new Date(`${startDate}T12:00:00`);
  const end = new Date(`${endDate}T12:00:00`);
  const dates: string[] = [];

  for (const current = new Date(start); current <= end; current.setDate(current.getDate() + 7)) {
    dates.push(formatDate(current));
  }

  return dates;
}
