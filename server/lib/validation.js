export const SELF_SERVE_ROLES = ["perumal_kainkaryam", "tirtha_kainkaryam", "coordinator"];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(email) {
  return typeof email === "string" && EMAIL_RE.test(email.trim());
}

export function isValidPassword(password) {
  return typeof password === "string" && password.length >= 8;
}

export function isSelfServeRole(role) {
  return SELF_SERVE_ROLES.includes(role);
}

export function normalizeEmail(email) {
  return email.trim().toLowerCase();
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const WINDOWS = ["morning", "evening"];

export function isValidDateString(date) {
  return typeof date === "string" && DATE_RE.test(date);
}

export function isValidWindow(window) {
  return WINDOWS.includes(window);
}

export function isValidRecurrenceEndDate(startDate, endDate) {
  return endDate === undefined || (isValidDateString(endDate) && endDate >= startDate);
}

export function isValidVacationRange(startDate, endDate) {
  if (!isValidDateString(startDate) || !isValidDateString(endDate) || endDate < startDate) {
    return false;
  }

  const start = new Date(`${startDate}T12:00:00`);
  const end = new Date(`${endDate}T12:00:00`);
  return !Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime())
    && start.toISOString().slice(0, 10) === startDate
    && end.toISOString().slice(0, 10) === endDate;
}

export function isValidVacationId(vacationId) {
  return typeof vacationId === "string" && /^[0-9a-f-]{36}$/i.test(vacationId);
}
