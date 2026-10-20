import prisma from "@/lib/prisma";
import { authorizePermiso, requirePermiso } from "@/lib/rbac";
import { getCurrentUser } from "@/lib/dal";
import { ROLES_LEGADO } from "@/lib/rbac/catalogo";
import { ROL_SUPERIOR } from "@/lib/rbac/jerarquia";
import { ROL_SUPERADMINISTRADOR } from "@/lib/rbac/modulos-plataforma";
import { DEFAULT_TEMPORARY_PASSWORD } from "@/lib/auth/default-password";
import { urlAvatar } from "@/lib/avatares";
import UsuariosClient, {
  type UserRow,
  type RoleOption,
  type SuperiorRef,
  type Arista,
} from "./usuarios-client";

export default async function UsuariosPage() {
  // Todos consultan Usuarios (19/Oct/2026). Quien no los administra (`usuarios:editar`) ve un
  // DIRECTORIO: solo los activos, con nombre, foto, rol, correo y a quién reportan, sin bloqueos,
  // intentos fallidos ni último ingreso, y sin los datos que solo usan los formularios.
  await requirePermiso("usuarios:ver");
  const [puedeCrear, puedeEditar, puedeEliminar] = await Promise.all([
    authorizePermiso("usuarios:crear").then((r) => r.ok),
    authorizePermiso("usuarios:editar").then((r) => r.ok),
    authorizePermiso("usuarios:eliminar").then((r) => r.ok),
  ]);
  const directorio = !puedeEditar;
  const rolesSuperiores = [...new Set(Object.values(ROL_SUPERIOR))];
  const [users, roles, currentUser, superioresBD, aristasBD] = await Promise.all([
    prisma.user.findMany({
      where: directorio ? { active: true } : {},
      orderBy: { name: "asc" },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        initials: true,
        avatarKey: true,
        active: true,
        lastLoginAt: true,
        failedLoginAttempts: true,
        blockedUntil: true,
        updatedAt: true,
      },
    }),
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

  // A quién reporta cada persona (superiores directos), por nombre.
  const nombrePorId = new Map([...superioresBD, ...users].map((u) => [u.id, u.name]));
  const reportaA = new Map<number, string[]>();
  for (const a of aristasBD) {
    const nombre = nombrePorId.get(a.superiorId);
    if (!nombre) continue;
    reportaA.set(a.subordinateId, [...(reportaA.get(a.subordinateId) ?? []), nombre]);
  }

  const rows: UserRow[] = users.map((u) => ({
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    initials: u.initials,
    avatarUrl: urlAvatar(u),
    active: u.active,
    lastLoginAt: !directorio && u.lastLoginAt ? u.lastLoginAt.toISOString() : null,
    failedLoginAttempts: directorio ? 0 : u.failedLoginAttempts,
    blockedUntil: !directorio && u.blockedUntil ? u.blockedUntil.toISOString() : null,
    reportaA: (reportaA.get(u.id) ?? []).sort((x, y) => x.localeCompare(y, "es")),
  }));
  const roleOptions: RoleOption[] = directorio
    ? []
    : roles
        .filter((r) => currentUser?.role === ROL_SUPERADMINISTRADOR || r.code !== ROL_SUPERADMINISTRADOR)
        .map((r) => ({ code: r.code, name: r.name }));
  const superiores: SuperiorRef[] = directorio ? [] : superioresBD;
  const aristas: Arista[] = directorio
    ? []
    : aristasBD.map((a) => ({
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
        permisos={{ crear: puedeCrear, editar: puedeEditar, eliminar: puedeEliminar }}
        // La clave temporal solo viaja a quien puede restablecerla.
        claveTemporal={puedeEditar ? DEFAULT_TEMPORARY_PASSWORD : null}
      />
    </div>
  );
}
