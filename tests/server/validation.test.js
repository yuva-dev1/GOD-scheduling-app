import { describe, expect, it } from "vitest";
import {
  isValidEmail,
  isValidPassword,
  isSelfServeRole,
  normalizeEmail,
  isValidDateString,
  isValidWindow,
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
    expect(isSelfServeRole("pirumar_kainkaryam")).toBe(true);
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
});
