import type { Role } from "../config/roles";
import type { AuthResult } from "../types/auth";

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

export async function fetchCurrentUser(token: string): Promise<AuthResult> {
  const res = await fetch(`${API_BASE}/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.json();
}
