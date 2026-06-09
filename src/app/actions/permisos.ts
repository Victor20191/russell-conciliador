"use server";

import { revalidatePath, updateTag } from "next/cache";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/dal";
import { logAudit } from "@/lib/audit";
import { authorizePermiso } from "@/lib/rbac";
import { RBAC_CACHE_TAG } from "@/lib/rbac/contexto";
import {
  NIVELES,
  NIVEL_META,
  permisosDeNivel,
  type Nivel,
  type PermisoLite,
} from "@/lib/rbac/niveles";
import { mensajeErrorBD } from "@/lib/errores";

export type CambioNivel = { roleId: number; module: string; nivel: Nivel };
export type GuardarNivelesResult = { ok: boolean; message?: string; guardados?: number };

/**
 * Guarda en lote los NIVELES de acceso de la matriz rol×módulo. Cada
 * cambio fija el nivel de un (rol, módulo): traduce el nivel a su paquete
 * acumulativo de permisos "<modulo>:<accion>" y sincroniza `roles_permisos`
 * (concede los que faltan, revoca los sobrantes) SOLO dentro de ese módulo.
 * Es la palanca que `getMatriz()` lee en runtime, así el cambio surte
 * efecto en la siguiente petición.
 */
export async function guardarNiveles(
  cambios: CambioNivel[],
): Promise<GuardarNivelesResult> {
  const authz = await authorizePermiso("roles:configurar");
  if (!authz.ok) return { ok: false, message: authz.message };

  if (!Array.isArray(cambios) || cambios.length === 0) {
    return { ok: false, message: "No hay cambios para guardar." };
  }
  for (const c of cambios) {
    if (!Number.isSafeInteger(c.roleId) || typeof c.module !== "string" || !NIVELES.includes(c.nivel)) {
      return { ok: false, message: "Parámetros inválidos." };
    }
  }

  const roleIds = [...new Set(cambios.map((c) => c.roleId))];

  try {
    const [roles, permisos, grants] = await Promise.all([
      prisma.role.findMany({ where: { id: { in: roleIds } }, select: { id: true, name: true } }),
      prisma.permission.findMany({
        where: { active: true },
        select: { id: true, code: true, module: true, action: true },
      }),
      prisma.rolePermission.findMany({
        where: { roleId: { in: roleIds } },
        select: { roleId: true, permissionId: true, permission: { select: { module: true } } },
      }),
    ]);

    const roleName = new Map(roles.map((r) => [r.id, r.name]));
    // Permisos por módulo.
    const porModulo = new Map<string, PermisoLite[]>();
    for (const p of permisos) {
      const arr = porModulo.get(p.module) ?? [];
      arr.push(p);
      porModulo.set(p.module, arr);
    }
    // Concesiones actuales: roleId → módulo → Set(permissionId).
    const actuales = new Map<number, Map<string, Set<number>>>();
    for (const g of grants) {
      const porRol = actuales.get(g.roleId) ?? new Map<string, Set<number>>();
      const set = porRol.get(g.permission.module) ?? new Set<number>();
      set.add(g.permissionId);
      porRol.set(g.permission.module, set);
      actuales.set(g.roleId, porRol);
    }

    const creates: { roleId: number; permissionId: number }[] = [];
    const deletePairs: { roleId: number; permissionId: number }[] = [];
    const auditar: { roleId: number; module: string; nivel: Nivel }[] = [];

    for (const c of cambios) {
      if (!roleName.has(c.roleId)) {
        return { ok: false, message: "Rol inexistente." };
      }
      const moduloPerms = porModulo.get(c.module) ?? [];
      const deseados = new Set(permisosDeNivel(moduloPerms, c.nivel));
      const vigentes = actuales.get(c.roleId)?.get(c.module) ?? new Set<number>();

      let cambio = false;
      for (const id of deseados) {
        if (!vigentes.has(id)) {
          creates.push({ roleId: c.roleId, permissionId: id });
          cambio = true;
        }
      }
      for (const id of vigentes) {
        if (!deseados.has(id)) {
          deletePairs.push({ roleId: c.roleId, permissionId: id });
          cambio = true;
        }
      }
      if (cambio) auditar.push({ roleId: c.roleId, module: c.module, nivel: c.nivel });
    }

    if (creates.length === 0 && deletePairs.length === 0) {
      return { ok: true, guardados: 0 };
    }

    const ops = [];
    if (deletePairs.length > 0) {
      ops.push(prisma.rolePermission.deleteMany({ where: { OR: deletePairs } }));
    }
    if (creates.length > 0) {
      ops.push(prisma.rolePermission.createMany({ data: creates, skipDuplicates: true }));
    }
    await prisma.$transaction(ops);

    const actor = await getCurrentUser();
    for (const a of auditar) {
      await logAudit({
        user: actor?.name ?? "Sistema",
        action: "CAMBIÓ NIVEL DE ACCESO",
        entity: `${roleName.get(a.roleId)} · ${a.module}`,
        detail: `Nivel asignado: ${NIVEL_META[a.nivel].label}`,
      });
    }

    // Invalida la matriz RBAC cacheada tras editar permisos, para que el
    // cambio surta efecto en la siguiente petición (read-your-own-writes).
    updateTag(RBAC_CACHE_TAG);
    revalidatePath("/config/permisos");
    return { ok: true, guardados: auditar.length };
  } catch (e) {
    return { ok: false, message: mensajeErrorBD("guardarNiveles", e) };
  }
}
