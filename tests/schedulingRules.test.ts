import { describe, expect, it } from "vitest";
import { ROLES } from "../src/config/roles";
import {
  isRoleEligibleOnDay,
  windowsForRoleOnDay,
  WEEKDAY_SCHEDULE,
  WEEKEND_SCHEDULE,
} from "../src/config/schedulingRules";

describe("schedulingRules", () => {
  it("opens weekday windows 6-11am and 4-9pm", () => {
    expect(WEEKDAY_SCHEDULE.morning).toEqual({ start: "06:00", end: "11:00" });
    expect(WEEKDAY_SCHEDULE.evening).toEqual({ start: "16:00", end: "21:00" });
  });

  it("opens weekend windows 8am-12pm and 7-9pm", () => {
    expect(WEEKEND_SCHEDULE.morning).toEqual({ start: "08:00", end: "12:00" });
    expect(WEEKEND_SCHEDULE.evening).toEqual({ start: "19:00", end: "21:00" });
  });

  it("allows tirtha kainkaryam only on Fri/Sat/Sun", () => {
    const allowed = [5, 6, 0] as const; // Fri, Sat, Sun
    const blocked = [1, 2, 3, 4] as const; // Mon-Thu

    for (const day of allowed) {
      expect(isRoleEligibleOnDay(ROLES.TIRTHA_KAINKARYAM, day)).toBe(true);
    }
    for (const day of blocked) {
      expect(isRoleEligibleOnDay(ROLES.TIRTHA_KAINKARYAM, day)).toBe(false);
    }
  });

  it("allows pirumar kainkaryam every day", () => {
    for (let day = 0; day <= 6; day++) {
      expect(
        isRoleEligibleOnDay(ROLES.PIRUMAR_KAINKARYAM, day as never),
      ).toBe(true);
    }
  });

  it("returns no windows for tirtha kainkaryam on a blocked day", () => {
    expect(windowsForRoleOnDay(ROLES.TIRTHA_KAINKARYAM, 2)).toEqual([]); // Tuesday
  });

  it("returns weekend windows for tirtha kainkaryam on Saturday", () => {
    expect(windowsForRoleOnDay(ROLES.TIRTHA_KAINKARYAM, 6)).toEqual([
      WEEKEND_SCHEDULE.morning,
      WEEKEND_SCHEDULE.evening,
    ]);
  });
});
