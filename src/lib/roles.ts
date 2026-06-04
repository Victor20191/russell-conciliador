export type Role = "Consulta" | "Auditor" | "Líder" | "Administrador";

export const ROLE_RANK: Record<Role, number> = {
  Consulta: 1,
  Auditor: 2,
  "Líder": 3,
  Administrador: 4,
};

export function roleRank(role: string): number {
  return ROLE_RANK[role as Role] ?? 0;
}

// ¿El rol `role` alcanza al menos el rango mínimo `min`?
export function can(role: string, min: Role): boolean {
  return roleRank(role) >= ROLE_RANK[min];
}
