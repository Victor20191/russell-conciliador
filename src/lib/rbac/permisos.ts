// ============================================================
// Resolver de autorización RBAC.
//
// Dos capas complementarias:
//   1) Permiso de ROL (global): ¿el rol tiene la acción?  → tienePermiso / MATRIZ
//   2) Alcance por DATO (cliente): ¿el usuario VE/ESCRIBE ese cliente?
//      → alcanzaCliente / asignaciones_cliente
//
// La decisión operativa sobre un cliente (puedeSobreCliente) exige
// AMBAS: tener el permiso de rol Y el alcance adecuado sobre el
// cliente. Esto materializa la segregación de funciones del PDF:
//   - Staff escribe SOLO los clientes de su cartera asignada.
//   - Senior/Gerente/Socio consultan (lectura), no ejecutan.
//
// Funciones PURAS (sin dependencias de Prisma/BD): operan sobre datos
// planos, por lo que sirven igual en pruebas (en memoria) y en la app
// (alimentadas desde la BD).
// ============================================================

import type { Matriz } from "./catalogo";

export type { Matriz };

type Identificador = string | number;

/** Asignación cliente↔usuario/equipo con su alcance (forma mínima para resolver). */
export type Asignacion = {
  clientId: Identificador;
  userId?: Identificador | null;
  teamId?: Identificador | null;
  readScope: boolean;
  writeScope: boolean;
  active?: boolean;
};

/** Acciones que MUTAN datos del cliente → exigen alcance de escritura. */
export const ACCIONES_ESCRITURA = new Set(["crear", "editar", "eliminar", "ejecutar"]);

/** Devuelve la acción de un permiso "<modulo>:<accion>". */
export function accionDe(permiso: string): string {
  return permiso.split(":")[1] ?? "";
}

/** ¿El rol tiene concedido el permiso (global, sin alcance de cliente)? */
export function tienePermiso(matriz: Matriz, roleCode: string, permiso: string): boolean {
  return (matriz[roleCode] ?? []).includes(permiso);
}

/**
 * ¿El usuario alcanza el cliente con el modo pedido?
 * Considera asignaciones directas (userId) y heredadas por equipo (teamId
 * ∈ equiposDelUsuario). En modo "escritura" exige writeScope; en "lectura",
 * readScope.
 */
export function alcanzaCliente(
  asignaciones: Asignacion[],
  userId: Identificador,
  clientId: Identificador,
  modo: "lectura" | "escritura",
  equiposDelUsuario: Identificador[] = [],
): boolean {
  const relevantes = asignaciones.filter(
    (a) =>
      a.active !== false &&
      a.clientId === clientId &&
      (a.userId === userId || (a.teamId != null && equiposDelUsuario.includes(a.teamId))),
  );
  return modo === "escritura"
    ? relevantes.some((a) => a.writeScope)
    : relevantes.some((a) => a.readScope);
}

export type ContextoCliente = {
  matriz: Matriz;
  roleCode: string;
  userId: Identificador;
  permiso: string; // p.ej. "conciliaciones:ejecutar"
  clientId: Identificador;
  asignaciones: Asignacion[];
  equiposDelUsuario?: Identificador[];
};

/**
 * Decisión combinada para una acción sobre un cliente:
 *   (el rol tiene el permiso)  AND  (el usuario tiene el alcance sobre el cliente)
 * El modo (lectura/escritura) se infiere de la acción del permiso.
 */
export function puedeSobreCliente(ctx: ContextoCliente): boolean {
  if (!tienePermiso(ctx.matriz, ctx.roleCode, ctx.permiso)) return false;
  const modo = ACCIONES_ESCRITURA.has(accionDe(ctx.permiso)) ? "escritura" : "lectura";
  return alcanzaCliente(ctx.asignaciones, ctx.userId, ctx.clientId, modo, ctx.equiposDelUsuario ?? []);
}
