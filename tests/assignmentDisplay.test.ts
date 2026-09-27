import { describe, expect, it } from "vitest";
import { assignmentInitials } from "../src/lib/assignmentDisplay";

describe("assignmentInitials", () => {
  it("uses the scheduling group's compact initials", () => {
    expect(assignmentInitials("aravind.seed@example.com")).toBe("AT");
    expect(assignmentInitials("srinand.seed@example.com")).toBe("SK");
    expect(assignmentInitials("swathik.seed@example.com")).toBe("ST");
    expect(assignmentInitials("srinivasan.seed@example.com")).toBe("SA");
  });

  it("falls back to the first two email-name letters", () => {
    expect(assignmentInitials("new.volunteer@example.com")).toBe("NV");
  });
});
