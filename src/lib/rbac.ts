// ============================================================
// Guards de autorización de la app.
//
// La autoridad es la MATRIZ RBAC (derivada del PDF de Roles y
// Responsabilidades), no una jerarquía de rangos. Cada acción/página se
// protege con su PERMISO canónico "<modulo>:<accion>" (ver
// src/lib/rbac/catalogo.ts). Para acciones sobre datos de un cliente se
// exige, además del permiso de rol, ALCANCE sobre ese cliente (cartera).
// ============================================================
import "server-only";
import { redirect } from "next/navigation";
import { verifySession } from "@/lib/dal";
import { tienePermiso, puedeSobreCliente } from "@/lib/rbac/permisos";
import { getMatriz, getAsignacionesUsuario } from "@/lib/rbac/contexto";
import { can, type Role } from "@/lib/roles";

export type AuthzResult =
  | { ok: true; userId: number; role: string }
  | { ok: false; message: string };

export type AuthzOpts = {
  // Si se incluye la clave, además del permiso de rol se exige ALCANCE
  // sobre este cliente (writeScope para crear/editar/eliminar/ejecutar,
  // readScope para lectura). Pasar `null` cuando no se pudo resolver el
  // cliente: deniega (fail-closed).
  clientId?: number | null;
};

async function decidir(permiso: string, opts: AuthzOpts): Promise<AuthzResult> {
  const session = await verifySession();
  if (session.mustChangePassword) redirect("/cambiar-contrasena");

  const matriz = await getMatriz();
  if (!tienePermiso(matriz, session.role, permiso)) {
    return { ok: false, message: "No tienes permisos para esta acción." };
  }

  // Alcance por cliente: solo si el caller lo solicitó (incluyó la clave).
  if ("clientId" in opts) {
    if (!opts.clientId) {
      return { ok: false, message: "No tienes alcance sobre este cliente." };
    }
    const { asignaciones, equipos } = await getAsignacionesUsuario(session.userId);
    const alcanza = puedeSobreCliente({
      matriz,
      roleCode: session.role,
      userId: session.userId,
      permiso,
      clientId: opts.clientId,
      asignaciones,
      equiposDelUsuario: equipos,
    });
    if (!alcanza) return { ok: false, message: "No tienes alcance sobre este cliente." };
  }

  return { ok: true, userId: session.userId, role: session.role };
}

/** Para Server Actions que devuelven ActionState: no lanza, devuelve el resultado. */
export async function authorizePermiso(
  permiso: string,
  opts: AuthzOpts = {},
): Promise<AuthzResult> {
  return decidir(permiso, opts);
}

/** Para páginas/layouts y Server Actions void: redirige si no cumple. */
export async function requirePermiso(permiso: string, opts: AuthzOpts = {}): Promise<void> {
  const result = await decidir(permiso, opts);
  if (!result.ok) redirect("/dashboard");
}

// Compatibilidad temporal para callers que todavía usan la jerarquía legado.
// Los flujos nuevos deben declarar el permiso canónico con authorizePermiso /
// requirePermiso.
export async function authorizeAction(min: Role): Promise<AuthzResult> {
  const session = await verifySession();
  if (session.mustChangePassword) redirect("/cambiar-contrasena");
  if (!can(session.role, min)) {
    return { ok: false, message: "No tienes permisos para esta acción." };
  }
  return { ok: true, userId: session.userId, role: session.role };
}

export async function requireRole(min: Role): Promise<void> {
  const result = await authorizeAction(min);
  if (!result.ok) redirect("/dashboard");
}
