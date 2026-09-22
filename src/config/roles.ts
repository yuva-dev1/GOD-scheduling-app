export const ROLES = {
  PERUMAL_KAINKARYAM: "perumal_kainkaryam",
  TIRTHA_KAINKARYAM: "tirtha_kainkaryam",
  ADMIN: "admin",
} as const;

export type Role = (typeof ROLES)[keyof typeof ROLES];

// The two roles a person signs up for. Admin is granted manually, not chosen
// at signup.
export const SELF_SERVE_ROLES: Role[] = [
  ROLES.PERUMAL_KAINKARYAM,
  ROLES.TIRTHA_KAINKARYAM,
];

export const ROLE_LABELS: Record<Role, string> = {
  [ROLES.PERUMAL_KAINKARYAM]: "Kainkaryam for Perumal",
  [ROLES.TIRTHA_KAINKARYAM]: "Tirtha Kainkaryam",
  [ROLES.ADMIN]: "Admin",
};
