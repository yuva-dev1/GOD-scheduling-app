import { describe, expect, it } from "vitest";
import {
  addMonthsToDate,
  calendarGridStart,
  getCalendarDays,
  rangeBetweenDates,
  weeklyDates,
  weeklyRecurrenceLabel,
} from "../src/lib/calendar";

describe("calendar helpers", () => {
  it("creates a six-week Sunday-starting grid", () => {
    const days = getCalendarDays(new Date(2026, 8, 1));

    expect(days).toHaveLength(42);
    expect(calendarGridStart(new Date(2026, 8, 1))).toBe("2026-08-30");
    expect(days[0].day).toBe(0);
    expect(days[1].date).toBe("2026-08-31");
  });

  it("returns inclusive ranges in either direction", () => {
    expect(rangeBetweenDates("2026-09-04", "2026-09-06")).toEqual([
      "2026-09-04",
      "2026-09-05",
      "2026-09-06",
    ]);
    expect(rangeBetweenDates("2026-09-06", "2026-09-04")).toEqual([
      "2026-09-06",
      "2026-09-05",
      "2026-09-04",
    ]);
  });

  it("creates a six-month default end date without overflowing short months", () => {
    expect(addMonthsToDate("2026-09-22", 6)).toBe("2027-03-22");
    expect(addMonthsToDate("2026-08-31", 6)).toBe("2027-02-28");
  });

  it("creates an inclusive weekly recurrence", () => {
    expect(weeklyDates("2026-09-04", "2026-09-25")).toEqual([
      "2026-09-04",
      "2026-09-11",
      "2026-09-18",
      "2026-09-25",
    ]);
  });

  it("labels only recurrences that include a later weekly date", () => {
    expect(weeklyRecurrenceLabel("2026-09-17", "2026-09-24")).toBe("Every week until Thursday, September 24");
    expect(weeklyRecurrenceLabel("2026-09-24", "2026-10-01")).toBe("Every week until Thursday, October 1");
    expect(weeklyRecurrenceLabel("2026-09-24", "2026-09-24")).toBeNull();
  });
});
