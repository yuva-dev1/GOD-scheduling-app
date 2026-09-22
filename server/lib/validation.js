export const SELF_SERVE_ROLES = ["pirumar_kainkaryam", "tirtha_kainkaryam"];

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
