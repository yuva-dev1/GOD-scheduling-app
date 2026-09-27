import { formatDate } from "../config/schedulingRules";
import { rangeBetweenDates } from "./calendar";

export type CoverageStatus = "red" | "yellow" | "green";

export interface CoverageVacationRange {
  email: string;
  startDate: string;
  endDate: string;
}

export function availablePerumalCount(
  totalPeople: number,
  date: string,
  vacations: CoverageVacationRange[],
): number {
  const awayEmails = new Set(
    vacations
      .filter((vacation) => date >= vacation.startDate && date <= vacation.endDate)
      .map((vacation) => vacation.email),
  );
  return Math.max(0, totalPeople - awayEmails.size);
}

export function coverageStatus(availablePeople: number): CoverageStatus {
  if (availablePeople <= 1) return "red";
  if (availablePeople === 2) return "yellow";
  return "green";
}

export function monthCoverageRisk(
  month: Date,
  totalPeople: number,
  vacations: CoverageVacationRange[],
): { red: number; yellow: number } {
  const start = new Date(month.getFullYear(), month.getMonth(), 1);
  const end = new Date(month.getFullYear(), month.getMonth() + 1, 0);
  const dates = rangeBetweenDates(formatDate(start), formatDate(end));

  return dates.reduce(
    (summary, date) => {
      const status = coverageStatus(availablePerumalCount(totalPeople, date, vacations));
      if (status === "red") summary.red += 1;
      if (status === "yellow") summary.yellow += 1;
      return summary;
    },
    { red: 0, yellow: 0 },
  );
}
