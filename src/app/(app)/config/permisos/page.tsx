import prisma from "@/lib/prisma";
import { requirePermiso } from "@/lib/rbac";
import { ROLES_MATRIZ } from "@/lib/rbac/catalogo";
import {
  ARBOL_MODULOS,
  nivelActual,
  nivelesDeModulo,
  esNivelParcial,
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
    // Solo los roles canónicos de la matriz se editan aquí; los legado
    // (Consulta/Auditor/Líder) quedan fuera de la pantalla (la action lo refuerza).
    prisma.role.findMany({
      where: { active: true, code: { in: [...ROLES_MATRIZ] } },
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
  // Celdas cuya concesión real no cubre todo su nivel (se señalizan como "Parcial").
  const parciales: Record<string, true> = {};

  const filaDe = (module: string, label: string, depth: 0 | 1): ModuloRow | null => {
    const perms = porModulo.get(module);
    if (!perms || perms.length === 0) return null;
    const niveles = nivelesDeModulo(perms);
    for (const r of roleCols) {
      const granted = grantsPorRol.get(r.id) ?? new Set<number>();
      const k = `${r.id}:${module}`;
      valores[k] = nivelActual(perms, granted);
      if (esNivelParcial(perms, granted)) parciales[k] = true;
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

  return <PermisosClient roles={roleCols} grupos={grupos} valores={valores} parciales={parciales} />;
}
