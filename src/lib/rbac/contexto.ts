// ============================================================
// Contexto de autorización en RUNTIME (lee BD).
//
// Conecta la matriz RBAC y el alcance por cliente con la app: aquí se
// cargan, desde la base, la matriz rol×permiso y las asignaciones de
// cliente del usuario (responsables directos + derivación del Socio),
// que `src/lib/rbac.ts` usa para decidir el acceso.
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
import { verifySession } from "@/lib/dal";
import { matrizConLegado } from "@/lib/rbac/catalogo";
import { ROL_SOCIO, ROLES_ALCANCE_GLOBAL, derivarAsignacionesSocio } from "@/lib/rbac/jerarquia";
import type { Matriz, Asignacion } from "@/lib/rbac/permisos";

export const RBAC_CACHE_TAG = "rbac-matriz-v3";

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
const getMatrizCached = unstable_cache(leerMatrizDeBD, ["rbac-matriz-v3"], {
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
 * Asignaciones VIGENTES que alcanzan al usuario: las directas (`userId`,
 * como responsable staff/senior/gerente de cada cliente) y, si el rol es
 * Socio, las DERIVADAS por jerarquía: lectura sobre los clientes donde
 * alguno de sus gerentes subordinados (jerarquia_usuarios) tiene
 * asignación vigente con función "gerente". La forma coincide con la que
 * espera `puedeSobreCliente`.
 *
 * Vigencia temporal: además de `active`, una fila solo cuenta si ya
 * inició (`vigente_desde <= ahora`) y no ha expirado (`vigente_hasta`
 * null = permanente, o >= ahora). Se filtra por fecha en este único
 * punto de lectura, y las funciones puras de `permisos.ts` no necesitan
 * saber de fechas (fail-safe).
 */
export const getAsignacionesUsuario = cache(
  async (userId: number, roleCode: string): Promise<{ asignaciones: Asignacion[] }> => {
    const ahora = new Date();
    // "Aún vigente": permanente (validUntil null) o no expirada.
    const noExpirada = [{ validUntil: null }, { validUntil: { gte: ahora } }];
    const vigente = { active: true, validFrom: { lte: ahora }, OR: noExpirada };
    const forma = {
      clientId: true,
      userId: true,
      readScope: true,
      writeScope: true,
      active: true,
    } as const;

    const directas = await prisma.clientAssignment.findMany({
      where: { ...vigente, userId },
      select: forma,
    });
    if (roleCode !== ROL_SOCIO) return { asignaciones: directas };

    // Socio: lectura derivada sobre la cartera de sus gerentes.
    const aristas = await prisma.userHierarchy.findMany({
      where: { superiorId: userId },
      select: { subordinateId: true },
    });
    const gerentes = aristas.map((a) => a.subordinateId);
    if (gerentes.length === 0) return { asignaciones: directas };

    const deGerentes = await prisma.clientAssignment.findMany({
      where: { ...vigente, role: "gerente", userId: { in: gerentes } },
      select: { clientId: true },
    });
    return {
      asignaciones: [...directas, ...derivarAsignacionesSocio(userId, deGerentes)],
    };
  },
);

/**
 * Cartera de LECTURA del usuario ACTUAL, para filtrar listados por cliente.
 *  - Administrador/Superadministrador → { todos: true }: alcance global, ven
 *    toda la plataforma (no se filtran por cartera).
 *  - Resto → los clientes donde el usuario tiene readScope vigente
 *    (asignaciones directas + derivación del Socio sobre sus gerentes).
 * Devuelve `clientIds` Y `clientNames` porque las entidades referencian al
 * cliente de forma inconsistente: `reconciliation.clientId` (FK) vs
 * `balance.clientName` / `clientAccount.clientName` (nombre). Fail-closed:
 * sin asignaciones, ambas listas quedan vacías (no ve nada). Memoizado por
 * request con React.cache().
 */
export type AlcanceLectura =
  | { todos: true }
  | { todos: false; clientIds: number[]; clientNames: string[] };

export const alcanceLecturaUsuario = cache(async (): Promise<AlcanceLectura> => {
  const session = await verifySession();
  if (ROLES_ALCANCE_GLOBAL.has(session.role)) return { todos: true };

  const { asignaciones } = await getAsignacionesUsuario(session.userId, session.role);
  const ids = [
    ...new Set(
      asignaciones
        .filter((a) => a.active !== false && a.readScope && a.userId === session.userId)
        .map((a) => a.clientId)
        .filter((id): id is number => typeof id === "number"),
    ),
  ];
  if (ids.length === 0) return { todos: false, clientIds: [], clientNames: [] };

  // Resuelve solo los clientes existentes (las asignaciones son FK suaves).
  const clientes = await prisma.client.findMany({
    where: { id: { in: ids } },
    select: { id: true, name: true },
  });
  return {
    todos: false,
    clientIds: clientes.map((c) => c.id),
    clientNames: [...new Set(clientes.map((c) => c.name))],
  };
});

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

// ============================================================
// Resolutores entidad → clientId, para pasar `{ clientId }` a los gates
// (requirePermiso/authorizePermiso) en acciones que tocan datos de un
// cliente. Todos son fail-closed: si la entidad no existe o su cliente
// no resuelve de forma única, devuelven null y el gate DENIEGA.
// ============================================================

/** Cliente de un balance de prueba (FK directa `clienteId` en el encabezado). */
export const clienteDeBalance = cache(async (balanceId: number): Promise<number | null> => {
  const balance = await prisma.balancePruebaEncabezado.findUnique({
    where: { id: balanceId },
    select: { clienteId: true },
  });
  return balance?.clienteId ?? null;
});

/** Cliente de una conciliación: usa la FK si existe; si no (datos legado), por nombre. */
export const clienteDeConciliacion = cache(async (reconciliationId: number): Promise<number | null> => {
  const rec = await prisma.reconciliation.findUnique({
    where: { id: reconciliationId },
    select: { clientId: true, clientName: true },
  });
  if (!rec) return null;
  return rec.clientId ?? clientIdPorNombre(rec.clientName);
});

/** Cliente de una partida de conciliación (vía su conciliación; no confía en el formulario). */
export const clienteDeFilaConciliacion = cache(async (rowId: number): Promise<number | null> => {
  const row = await prisma.reconciliationRow.findUnique({
    where: { id: rowId },
    select: { reconciliationId: true },
  });
  return row ? clienteDeConciliacion(row.reconciliationId) : null;
});

/** Cliente de una cuenta del mapeo (ClientAccount referencia al cliente por nombre). */
export const clienteDeCuentaCliente = cache(async (accountId: number): Promise<number | null> => {
  const cuenta = await prisma.clientAccount.findUnique({
    where: { id: accountId },
    select: { clientName: true },
  });
  return clientIdPorNombre(cuenta?.clientName);
});
