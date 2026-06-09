"use server";

import { revalidatePath, updateTag } from "next/cache";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/dal";
import { logAudit } from "@/lib/audit";
import { authorizePermiso } from "@/lib/rbac";
import { RBAC_CACHE_TAG } from "@/lib/rbac/contexto";
import { ROLES_MATRIZ } from "@/lib/rbac/catalogo";
import {
  NIVEL_META,
  permisosDeNivel,
  type Nivel,
  type PermisoLite,
} from "@/lib/rbac/niveles";
import { GuardarNivelesSchema } from "@/lib/definitions";
import { mensajeErrorBD } from "@/lib/errores";

export type CambioNivel = { roleId: number; module: string; nivel: Nivel };
export type GuardarNivelesResult = { ok: boolean; message?: string; guardados?: number };

// Solo los roles canónicos de la matriz son editables desde esta pantalla. Los
// roles legado (Consulta/Auditor/Líder) y cualquier rol no canónico quedan fuera
// (defensa en profundidad: la página ya filtra las columnas a este conjunto).
const ROLES_EDITABLES = new Set<string>(ROLES_MATRIZ);

// Permisos que NUNCA deben quedar sin ningún rol activo que los porte. Perder el
// último portador de `roles:configurar` deja la matriz inaccesible (auto-bloqueo);
// perder `usuarios:*` deja la plataforma sin gestión de usuarios. La salvaguarda
// es fail-closed: ante el riesgo, se cancela toda la operación.
const PERMISOS_CRITICOS = [
  "roles:configurar",
  "usuarios:crear",
  "usuarios:editar",
  "usuarios:eliminar",
] as const;
const ES_CRITICO = new Set<string>(PERMISOS_CRITICOS);

type Par = { roleId: number; permissionId: number };

/**
 * Guarda en lote los NIVELES de acceso de la matriz rol×módulo. Cada cambio fija
 * el nivel de un (rol, módulo): traduce el nivel a su paquete acumulativo de
 * permisos "<modulo>:<accion>" y sincroniza `roles_permisos` (concede los que
 * faltan, revoca los sobrantes) SOLO dentro de ese módulo. Es la palanca que
 * `getMatriz()` lee en runtime, así el cambio surte efecto en la siguiente
 * petición (read-your-own-writes vía updateTag).
 */
export async function guardarNiveles(
  cambios: CambioNivel[],
): Promise<GuardarNivelesResult> {
  const authz = await authorizePermiso("roles:configurar");
  if (!authz.ok) return { ok: false, message: authz.message };

  // Validación de forma con Zod (patrón del proyecto).
  const parsed = GuardarNivelesSchema.safeParse(cambios);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Parámetros inválidos." };
  }
  const datos = parsed.data;

  const roleIds = [...new Set(datos.map((c) => c.roleId))];

  try {
    const [roles, permisos, grants] = await Promise.all([
      prisma.role.findMany({ where: { id: { in: roleIds } }, select: { id: true, code: true, name: true } }),
      prisma.permission.findMany({
        where: { active: true },
        select: { id: true, code: true, module: true, action: true },
      }),
      prisma.rolePermission.findMany({
        where: { roleId: { in: roleIds } },
        select: { roleId: true, permissionId: true, permission: { select: { module: true } } },
      }),
    ]);

    const roleById = new Map(roles.map((r) => [r.id, r]));

    // Solo se editan roles canónicos existentes (defensa en profundidad).
    for (const c of datos) {
      const rol = roleById.get(c.roleId);
      if (!rol) return { ok: false, message: "Rol inexistente." };
      if (!ROLES_EDITABLES.has(rol.code)) {
        return { ok: false, message: `El rol "${rol.name}" no es editable desde esta pantalla.` };
      }
    }

    // Permisos por módulo + índice id→code.
    const porModulo = new Map<string, PermisoLite[]>();
    const codePorId = new Map<number, string>();
    for (const p of permisos) {
      const arr = porModulo.get(p.module) ?? [];
      arr.push(p);
      porModulo.set(p.module, arr);
      codePorId.set(p.id, p.code);
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

    const creates: Par[] = [];
    const deletePairs: Par[] = [];
    const auditar: { roleId: number; module: string; nivel: Nivel }[] = [];

    for (const c of datos) {
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

    // Salvaguarda anti-bloqueo (fail-closed): rechaza la operación si dejaría
    // algún permiso crítico sin ningún rol activo que lo porte.
    const guard = await verificarNoBloqueo(deletePairs, creates, codePorId);
    if (!guard.ok) return guard;

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
        entity: `${roleById.get(a.roleId)?.name ?? a.roleId} · ${a.module}`,
        detail: `Nivel asignado: ${NIVEL_META[a.nivel].label}`,
      });
    }

    // Invalida la matriz RBAC cacheada tras editar permisos, para que el cambio
    // surta efecto en la siguiente petición (read-your-own-writes). En Next 16
    // `updateTag` es la API para expiración inmediata desde Server Actions y SÍ
    // invalida los tags de `unstable_cache` (mismo registro que `revalidateTag`).
    updateTag(RBAC_CACHE_TAG);
    revalidatePath("/config/permisos");
    return { ok: true, guardados: auditar.length };
  } catch (e) {
    return { ok: false, message: mensajeErrorBD("guardarNiveles", e) };
  }
}

/**
 * Simula el estado de los permisos críticos sobre TODOS los roles activos tras
 * aplicar el delta planificado y deniega si alguno quedaría sin portadores.
 * Si la operación no toca ningún permiso crítico, no consulta la BD.
 */
async function verificarNoBloqueo(
  deletePairs: Par[],
  creates: Par[],
  codePorId: Map<number, string>,
): Promise<GuardarNivelesResult> {
  // Solo puede causar bloqueo el BORRADO de un permiso crítico; un alta nunca
  // reduce portadores. Si la operación no borra ningún crítico, no hay riesgo.
  const codigosEnRiesgo = new Set<string>();
  for (const d of deletePairs) {
    const code = codePorId.get(d.permissionId);
    if (code && ES_CRITICO.has(code)) codigosEnRiesgo.add(code);
  }
  if (codigosEnRiesgo.size === 0) return { ok: true };

  // Portadores actuales de los permisos críticos, entre roles ACTIVOS.
  const holders = await prisma.rolePermission.findMany({
    where: {
      role: { active: true },
      permission: { code: { in: [...PERMISOS_CRITICOS] } },
    },
    select: { roleId: true, permission: { select: { code: true } } },
  });

  // code → Set(roleId), estado actual.
  const porCodigo = new Map<string, Set<number>>();
  for (const code of PERMISOS_CRITICOS) porCodigo.set(code, new Set<number>());
  for (const h of holders) porCodigo.get(h.permission.code)?.add(h.roleId);

  // Aplica el delta planificado (los deletes quitan portadores; los creates añaden).
  for (const d of deletePairs) {
    const code = codePorId.get(d.permissionId);
    if (code) porCodigo.get(code)?.delete(d.roleId);
  }
  for (const c of creates) {
    const code = codePorId.get(c.permissionId);
    if (code) porCodigo.get(code)?.add(c.roleId);
  }

  for (const code of codigosEnRiesgo) {
    if ((porCodigo.get(code)?.size ?? 0) === 0) {
      return {
        ok: false,
        message: `La operación dejaría a la plataforma sin ningún rol con "${code}". Mantén ese permiso en al menos un rol.`,
      };
    }
  }
  return { ok: true };
}
