import { describe, expect, it } from "vitest";
import {
  isValidEmail,
  isValidPassword,
  isSelfServeRole,
  normalizeEmail,
  isValidDateString,
  isValidWindow,
  isValidRecurrenceEndDate,
} from "../../server/lib/validation.js";

describe("validation", () => {
  it("accepts well-formed emails", () => {
    expect(isValidEmail("person@example.com")).toBe(true);
    expect(isValidEmail("bad-email")).toBe(false);
    expect(isValidEmail("")).toBe(false);
  });

  it("requires an 8+ character password", () => {
    expect(isValidPassword("short")).toBe(false);
    expect(isValidPassword("longenough1")).toBe(true);
  });

  it("only allows self-serve roles at signup", () => {
    expect(isSelfServeRole("perumal_kainkaryam")).toBe(true);
    expect(isSelfServeRole("tirtha_kainkaryam")).toBe(true);
    expect(isSelfServeRole("admin")).toBe(false);
    expect(isSelfServeRole("nonsense")).toBe(false);
  });

  it("lowercases and trims email for storage/lookup", () => {
    expect(normalizeEmail("  Person@Example.com ")).toBe("person@example.com");
  });

  it("only accepts YYYY-MM-DD date strings", () => {
    expect(isValidDateString("2026-03-05")).toBe(true);
    expect(isValidDateString("2026-3-5")).toBe(false);
    expect(isValidDateString("not a date")).toBe(false);
    expect(isValidDateString(undefined)).toBe(false);
  });

  it("only accepts morning/evening windows", () => {
    expect(isValidWindow("morning")).toBe(true);
    expect(isValidWindow("evening")).toBe(true);
    expect(isValidWindow("afternoon")).toBe(false);
  });

  it("accepts an omitted or forward recurrence end date only", () => {
    expect(isValidRecurrenceEndDate("2026-09-24", undefined)).toBe(true);
    expect(isValidRecurrenceEndDate("2026-09-24", "2027-03-24")).toBe(true);
    expect(isValidRecurrenceEndDate("2026-09-24", "2026-09-23")).toBe(false);
    expect(isValidRecurrenceEndDate("2026-09-24", "not-a-date")).toBe(false);
  });
});
