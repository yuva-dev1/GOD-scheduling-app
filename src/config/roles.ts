export const ROLES = {
  PERUMAL_KAINKARYAM: "perumal_kainkaryam",
  TIRTHA_KAINKARYAM: "tirtha_kainkaryam",
  COORDINATOR: "coordinator",
  ADMIN: "admin",
} as const;

export type Role = (typeof ROLES)[keyof typeof ROLES];

// Roles that can sign up for and manage their own slots. Admin is the shared
// password identity; coordinator accounts also receive admin permissions.
export const SELF_SERVE_ROLES: Role[] = [
  ROLES.PERUMAL_KAINKARYAM,
  ROLES.TIRTHA_KAINKARYAM,
  ROLES.COORDINATOR,
];

export function hasAdminPermissions(role: Role | null | undefined): boolean {
  return role === ROLES.ADMIN || role === ROLES.COORDINATOR;
}

export const ROLE_LABELS: Record<Role, string> = {
  [ROLES.PERUMAL_KAINKARYAM]: "Kainkaryam for Perumal",
  [ROLES.TIRTHA_KAINKARYAM]: "Tirtha Kainkaryam",
  [ROLES.COORDINATOR]: "Coordinator",
  [ROLES.ADMIN]: "Admin",
};
