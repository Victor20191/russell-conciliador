import prisma from "@/lib/prisma";
import { requirePermiso } from "@/lib/rbac";
import { getCurrentUser } from "@/lib/dal";
import { ROLES_LEGADO } from "@/lib/rbac/catalogo";
import { ROL_SUPERIOR } from "@/lib/rbac/jerarquia";
import { ROL_SUPERADMINISTRADOR } from "@/lib/rbac/modulos-plataforma";
import { urlAvatar } from "@/lib/avatares";
import UsuariosClient, {
  type UserRow,
  type RoleOption,
  type SuperiorRef,
  type Arista,
} from "./usuarios-client";

export default async function UsuariosPage() {
  await requirePermiso("usuarios:ver");
  const rolesSuperiores = [...new Set(Object.values(ROL_SUPERIOR))];
  const [users, roles, currentUser, superioresBD, aristasBD] = await Promise.all([
    prisma.user.findMany({ orderBy: { name: "asc" } }),
    prisma.role.findMany({
      where: { active: true, code: { notIn: [...ROLES_LEGADO] } },
      orderBy: { rank: "desc" },
      select: { code: true, name: true },
    }),
    getCurrentUser(),
    prisma.user.findMany({
      where: { active: true, role: { in: rolesSuperiores } },
      orderBy: { name: "asc" },
      select: { id: true, name: true, role: true },
    }),
    prisma.userHierarchy.findMany({
      select: { superiorId: true, subordinateId: true },
    }),
  ]);
  const rows: UserRow[] = users.map((u) => ({
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    initials: u.initials,
    avatarUrl: urlAvatar(u),
    active: u.active,
    lastLoginAt: u.lastLoginAt ? u.lastLoginAt.toISOString() : null,
    failedLoginAttempts: u.failedLoginAttempts,
    blockedUntil: u.blockedUntil ? u.blockedUntil.toISOString() : null,
  }));
  const roleOptions: RoleOption[] = roles
    .filter((r) => currentUser?.role === ROL_SUPERADMINISTRADOR || r.code !== ROL_SUPERADMINISTRADOR)
    .map((r) => ({ code: r.code, name: r.name }));
  const superiores: SuperiorRef[] = superioresBD;
  const aristas: Arista[] = aristasBD.map((a) => ({
    superiorId: a.superiorId,
    subordinadoId: a.subordinateId,
  }));

  return (
    <div>
      <UsuariosClient
        rows={rows}
        roles={roleOptions}
        canManageSuperadmins={currentUser?.role === ROL_SUPERADMINISTRADOR}
        superiores={superiores}
        aristas={aristas}
      />
    </div>
  );
}
