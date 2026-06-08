import prisma from "@/lib/prisma";
import { requirePermiso } from "@/lib/rbac";
import {
  ARBOL_MODULOS,
  nivelActual,
  nivelesDeModulo,
  type Nivel,
  type PermisoLite,
} from "@/lib/rbac/niveles";
import PermisosClient, {
  type RoleCol,
  type GrupoMatriz,
  type ModuloRow,
} from "./permisos-client";

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
      select: { id: true, code: true, module: true, action: true },
    }),
    prisma.rolePermission.findMany({ select: { roleId: true, permissionId: true } }),
  ]);

  const roleCols: RoleCol[] = roles.map((r) => ({ id: r.id, code: r.code, name: r.name }));

  // Permisos por módulo.
  const porModulo = new Map<string, PermisoLite[]>();
  for (const p of permisos) {
    const arr = porModulo.get(p.module) ?? [];
    arr.push(p);
    porModulo.set(p.module, arr);
  }
  // Permisos concedidos por rol (set de permissionId).
  const grantsPorRol = new Map<number, Set<number>>();
  for (const c of concesiones) {
    const set = grantsPorRol.get(c.roleId) ?? new Set<number>();
    set.add(c.permissionId);
    grantsPorRol.set(c.roleId, set);
  }

  // Construye las filas a partir del árbol de presentación, omitiendo
  // módulos sin permisos sembrados.
  const grupos: GrupoMatriz[] = [];
  const valores: Record<string, Nivel> = {};

  const filaDe = (module: string, label: string, depth: 0 | 1): ModuloRow | null => {
    const perms = porModulo.get(module);
    if (!perms || perms.length === 0) return null;
    const niveles = nivelesDeModulo(perms);
    for (const r of roleCols) {
      const granted = grantsPorRol.get(r.id) ?? new Set<number>();
      valores[`${r.id}:${module}`] = nivelActual(perms, granted);
    }
    return { module, label, depth, niveles };
  };

  for (const g of ARBOL_MODULOS) {
    const filas: ModuloRow[] = [];
    for (const item of g.items) {
      const padre = filaDe(item.module, item.label, 0);
      if (padre) filas.push(padre);
      for (const h of item.hijos ?? []) {
        const hijo = filaDe(h.module, h.label, 1);
        if (hijo) filas.push(hijo);
      }
    }
    if (filas.length > 0) grupos.push({ titulo: g.grupo, filas });
  }

  return <PermisosClient roles={roleCols} grupos={grupos} valores={valores} />;
}
