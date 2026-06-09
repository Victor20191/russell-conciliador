// ============================================================
// Contexto de autorización en RUNTIME (lee BD).
//
// Conecta la matriz RBAC y el alcance por cartera con la app: aquí se
// cargan, desde la base, la matriz rol×permiso y las asignaciones de
// cliente del usuario, que `src/lib/rbac.ts` usa para decidir el acceso.
//
// getMatriz usa unstable_cache (Data Cache de Next.js) con el tag
// "rbac-matriz": persiste entre requests y se invalida solo cuando el
// administrador edita permisos (revalidateTag desde la server action).
// Las demás funciones usan React.cache() (memoización por request).
// ============================================================
import "server-only";
import { cache } from "react";
import { unstable_cache } from "next/cache";
import prisma from "@/lib/prisma";
import { matrizConLegado } from "@/lib/rbac/catalogo";
import type { Matriz, Asignacion } from "@/lib/rbac/permisos";

export const RBAC_CACHE_TAG = "rbac-matriz-v2";

// La función interna que lee de BD (sin cache layer).
async function leerMatrizDeBD(): Promise<Matriz> {
  const filas = await prisma.rolePermission.findMany({
    select: {
      role: { select: { code: true } },
      permission: { select: { code: true } },
    },
  });
  if (filas.length === 0) return matrizConLegado();
  const m: Matriz = {};
  for (const f of filas) (m[f.role.code] ??= []).push(f.permission.code);
  return m;
}

// unstable_cache: persiste entre requests hasta que revalidateTag(RBAC_CACHE_TAG)
// sea llamado. Se combina con cache() para deduplicar dentro del mismo request.
const getMatrizCached = unstable_cache(leerMatrizDeBD, ["rbac-matriz-v2"], {
  tags: [RBAC_CACHE_TAG],
  revalidate: 3600, // revalidación máxima: 1 hora (fallback si no hay tag invalidation)
});

/**
 * Matriz rol×permiso EFECTIVA. Cacheada en el Data Cache de Next.js;
 * se invalida con revalidateTag(RBAC_CACHE_TAG) cuando el admin edita.
 */
export const getMatriz = cache(async (): Promise<Matriz> => {
  try {
    return await getMatrizCached();
  } catch {
    // Si la BD no responde, no abrir el acceso: usar el catálogo conocido.
    return matrizConLegado();
  }
});

/**
 * Asignaciones de cartera VIGENTES que alcanzan al usuario: directas
 * (`userId`) y heredadas por equipo (`teamId` ∈ sus equipos). La forma
 * coincide con la que espera `puedeSobreCliente`.
 *
 * Vigencia temporal (membresía y cartera): además de `active`, una fila
 * solo cuenta si ya inició (`vigente_desde <= ahora`) y no ha expirado
 * (`vigente_hasta` null = permanente, o >= ahora). Así una asignación
 * temporal a OTRO equipo deja de autorizar al expirar SIN un job: se
 * filtra por fecha en este único punto de lectura, y las funciones puras
 * de `permisos.ts` no necesitan saber de fechas (fail-safe).
 */
export const getAsignacionesUsuario = cache(
  async (userId: number): Promise<{ asignaciones: Asignacion[]; equipos: number[] }> => {
    const ahora = new Date();
    // "Aún vigente": permanente (validUntil null) o no expirada.
    const noExpirada = [{ validUntil: null }, { validUntil: { gte: ahora } }];

    const miembros = await prisma.teamMember.findMany({
      where: { userId, active: true, validFrom: { lte: ahora }, OR: noExpirada },
      select: { teamId: true },
    });
    const equipos = miembros.map((m) => m.teamId);

    const asignaciones = await prisma.clientAssignment.findMany({
      where: {
        active: true,
        validFrom: { lte: ahora },
        // Dos condiciones OR distintas (vigencia + alcance) se combinan con
        // AND explícito para no colisionar la misma clave `OR`.
        AND: [{ OR: noExpirada }, { OR: [{ userId }, { teamId: { in: equipos } }] }],
      },
      select: {
        clientId: true,
        userId: true,
        teamId: true,
        readScope: true,
        writeScope: true,
        active: true,
      },
    });
    return { asignaciones, equipos };
  },
);

/**
 * Puente clientName → Client.id. Las entidades de negocio referencian al
 * cliente por NOMBRE, pero la cartera (`asignaciones_cliente`) usa
 * `Client.id`. Devuelve null si el nombre no resuelve a EXACTAMENTE un
 * cliente (fail-closed: ante ambigüedad, deniega).
 */
export const clientIdPorNombre = cache(
  async (name: string | null | undefined): Promise<number | null> => {
    if (!name) return null;
    const matches = await prisma.client.findMany({
      where: { name },
      select: { id: true },
      take: 2,
    });
    return matches.length === 1 ? matches[0].id : null;
  },
);
