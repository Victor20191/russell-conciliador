// ============================================================
// Contexto de autorización en RUNTIME (lee BD).
//
// Conecta la matriz RBAC y el alcance por cartera con la app: aquí se
// cargan, desde la base, la matriz rol×permiso y las asignaciones de
// cliente del usuario, que `src/lib/rbac.ts` usa para decidir el acceso.
//
// Funciones cacheadas por request (`cache()` de React): se evalúan una
// sola vez por petición aunque varios guards las invoquen.
// ============================================================
import "server-only";
import { cache } from "react";
import prisma from "@/lib/prisma";
import { matrizConLegado } from "@/lib/rbac/catalogo";
import type { Matriz, Asignacion } from "@/lib/rbac/permisos";

/**
 * Matriz rol×permiso EFECTIVA, leída de `roles_permisos` (editable por el
 * Administrador). Si la tabla está vacía (BD sin sembrar) cae al catálogo
 * en memoria (`matrizConLegado`) para no dejar la app sin autorización.
 */
export const getMatriz = cache(async (): Promise<Matriz> => {
  try {
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
  } catch {
    // Si la BD no responde, no abrir el acceso: usar el catálogo conocido.
    return matrizConLegado();
  }
});

/**
 * Asignaciones de cartera ACTIVAS que alcanzan al usuario: directas
 * (`userId`) y heredadas por equipo (`teamId` ∈ sus equipos). La forma
 * coincide con la que espera `puedeSobreCliente`.
 */
export const getAsignacionesUsuario = cache(
  async (userId: number): Promise<{ asignaciones: Asignacion[]; equipos: number[] }> => {
    const miembros = await prisma.teamMember.findMany({
      where: { userId, active: true },
      select: { teamId: true },
    });
    const equipos = miembros.map((m) => m.teamId);
    const asignaciones = await prisma.clientAssignment.findMany({
      where: {
        active: true,
        OR: [{ userId }, { teamId: { in: equipos } }],
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
