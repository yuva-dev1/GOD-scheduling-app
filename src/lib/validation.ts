import { SELF_SERVE_ROLES, type Role } from "../config/roles";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(email: string): boolean {
  return EMAIL_RE.test(email.trim());
}

export function isValidPassword(password: string): boolean {
  return password.length >= 8;
}

export function isSelfServeRole(role: string): role is Role {
  return (SELF_SERVE_ROLES as string[]).includes(role);
}
