export const SHRAVANAM_DATES = new Set([
  "2026-10-19",
  "2026-11-16",
  "2026-12-13",
  "2027-01-09",
  "2027-02-06",
  "2027-03-05",
]);

export function isShravanamDate(date: string): boolean {
  return SHRAVANAM_DATES.has(date);
}
