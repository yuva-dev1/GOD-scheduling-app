import { describe, expect, it } from "vitest";
import { calendarGridStart, getCalendarDays, rangeBetweenDates } from "../src/lib/calendar";

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
});
