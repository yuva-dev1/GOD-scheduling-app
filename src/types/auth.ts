import type { Role } from "../config/roles";

export interface AuthUser {
  userId: string;
  email: string;
  role: Role;
}

export interface AuthResult {
  success: boolean;
  token?: string;
  user?: AuthUser;
  message?: string;
  clearedAssignmentCount?: number;
  updatedVacationCount?: number;
}

export interface AccountDeletionResult {
  success: boolean;
  message?: string;
  clearedAssignmentCount?: number;
  removedVacationCount?: number;
}
