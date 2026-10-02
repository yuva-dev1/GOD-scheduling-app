import type { VacationSession } from "../types/vacations";

export function vacationSessionLabel(session: VacationSession): string {
  if (session === "morning") return "AM only";
  if (session === "evening") return "PM only";
  return "All day";
}

export function vacationAppliesToWindow(session: VacationSession, window: "morning" | "evening"): boolean {
  return !session || session === "full_day" || session === window;
}
