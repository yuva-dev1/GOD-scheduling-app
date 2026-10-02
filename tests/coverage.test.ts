import { describe, expect, it } from "vitest";
import { availablePerumalCount, coverageStatus, monthCoverageRisk } from "../src/lib/coverage";

describe("Perumal coverage indicators", () => {
  it("uses red for 0-1, yellow for 2, and green for 3+ available people", () => {
    expect(coverageStatus(0)).toBe("red");
    expect(coverageStatus(1)).toBe("red");
    expect(coverageStatus(2)).toBe("yellow");
    expect(coverageStatus(3)).toBe("green");
    expect(coverageStatus(5)).toBe("green");
  });

  it("counts each vacationing Perumal volunteer once per day", () => {
    const vacations = [
      { email: "one@example.com", startDate: "2026-10-02", endDate: "2026-10-04" },
      { email: "one@example.com", startDate: "2026-10-03", endDate: "2026-10-05" },
      { email: "two@example.com", startDate: "2026-10-04", endDate: "2026-10-04" },
    ];

    expect(availablePerumalCount(4, "2026-10-02", vacations)).toBe(3);
    expect(availablePerumalCount(4, "2026-10-04", vacations)).toBe(2);
    expect(availablePerumalCount(4, "2026-10-06", vacations)).toBe(4);
  });

  it("summarizes red and yellow days for the selected month", () => {
    const risk = monthCoverageRisk(new Date(2026, 9, 1), 4, [
      { email: "one@example.com", startDate: "2026-10-01", endDate: "2026-10-31" },
      { email: "two@example.com", startDate: "2026-10-01", endDate: "2026-10-03" },
      { email: "three@example.com", startDate: "2026-10-02", endDate: "2026-10-02" },
    ]);

    expect(risk).toEqual({ red: 1, yellow: 2 });
  });
});
