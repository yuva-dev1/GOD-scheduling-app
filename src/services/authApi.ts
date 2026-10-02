import type { Role } from "../config/roles";
import type { AccountDeletionResult, AuthResult } from "../types/auth";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "/api";

async function postJson(path: string, payload: unknown): Promise<AuthResult> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return res.json();
}

export function register(
  email: string,
  password: string,
  role: Role,
): Promise<AuthResult> {
  return postJson("/auth/register", { email, password, role });
}

export function login(email: string, password: string): Promise<AuthResult> {
  return postJson("/auth/login", { email, password });
}

export function requestPasswordReset(email: string): Promise<AuthResult> {
  return postJson("/auth/password-reset/request", { email });
}

export function completePasswordReset(token: string, password: string): Promise<AuthResult> {
  return postJson("/auth/password-reset/complete", { token, password });
}

export async function fetchCurrentUser(token: string): Promise<AuthResult> {
  const res = await fetch(`${API_BASE}/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.json();
}

export async function changeRole(token: string, role: Role): Promise<AuthResult> {
  const res = await fetch(`${API_BASE}/auth/account/role`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ role }),
  });
  return res.json();
}

export async function deleteAccount(token: string): Promise<AccountDeletionResult> {
  const res = await fetch(`${API_BASE}/auth/account`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.json();
}
