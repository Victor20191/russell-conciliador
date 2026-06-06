import prisma from "@/lib/prisma";
import { requirePermiso } from "@/lib/rbac";
import PermisosClient, { type RoleCol, type PermisoRow } from "./permisos-client";

export default async function PermisosPage() {
  // Editar la matriz rol×permiso es administración de la herramienta.
  await requirePermiso("roles:configurar");

  const [roles, permisos, concesiones] = await Promise.all([
    prisma.role.findMany({
      where: { active: true },
      orderBy: { rank: "desc" },
      select: { id: true, code: true, name: true },
    }),
    prisma.permission.findMany({
      where: { active: true },
      orderBy: [{ module: "asc" }, { action: "asc" }],
      select: { id: true, code: true, module: true, action: true, label: true },
    }),
    prisma.rolePermission.findMany({ select: { roleId: true, permissionId: true } }),
  ]);

  const roleCols: RoleCol[] = roles.map((r) => ({ id: r.id, code: r.code, name: r.name }));
  const permisoRows: PermisoRow[] = permisos.map((p) => ({
    id: p.id,
    code: p.code,
    module: p.module,
    action: p.action,
    label: p.label,
  }));
  const concedidos = concesiones.map((c) => `${c.roleId}:${c.permissionId}`);

  return <PermisosClient roles={roleCols} permisos={permisoRows} concedidos={concedidos} />;
}
