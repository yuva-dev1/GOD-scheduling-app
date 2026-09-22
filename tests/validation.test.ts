import { describe, expect, it } from "vitest";
import { isValidEmail, isValidPassword, isSelfServeRole } from "../src/lib/validation";

describe("frontend validation", () => {
  it("accepts well-formed emails", () => {
    expect(isValidEmail("person@example.com")).toBe(true);
    expect(isValidEmail("nope")).toBe(false);
  });

  it("requires an 8+ character password", () => {
    expect(isValidPassword("short")).toBe(false);
    expect(isValidPassword("longenough1")).toBe(true);
  });

  it("only allows self-serve roles", () => {
    expect(isSelfServeRole("perumal_kainkaryam")).toBe(true);
    expect(isSelfServeRole("tirtha_kainkaryam")).toBe(true);
    expect(isSelfServeRole("admin")).toBe(false);
  });
});
