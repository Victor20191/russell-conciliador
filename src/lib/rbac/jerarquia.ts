// ============================================================
// Jerarquía organizacional y funciones de responsable por cliente.
//
// La organización es: Socio → Gerentes → Seniors → Staffs (muchos a
// muchos en cada nivel: un staff puede reportar a varios seniors, un
// senior a varios gerentes, etc.). Las aristas viven en la tabla
// jerarquia_usuarios y se gestionan desde la ficha del usuario.
//
// Un cliente admite UNO O VARIOS staff y EXACTAMENTE un senior y un
// gerente, elegidos al crear/editar el cliente:
//   staff   → ejecuta la auditoría (alcance de escritura) · uno o varios
//   senior  → revisa               (alcance de lectura) · uno
//   gerente → valida               (alcance de lectura) · uno
// El Socio NO se asigna por cliente: deriva LECTURA sobre los clientes
// donde alguno de sus gerentes subordinados esté asignado como gerente
// (derivarAsignacionesSocio).
//
// Funciones PURAS (sin Prisma/BD): importables desde client components
// y testeables en memoria, igual que permisos.ts.
// ============================================================

import type { Asignacion } from "./permisos";

export const ROL_SOCIO = "Socio";

/**
 * Roles con ALCANCE GLOBAL sobre la cartera: administran y consultan toda la
 * plataforma sin asignación directa por cliente. No se les aplica el filtro de
 * cartera (ni en lectura ni en administración de clientes); el resto de roles
 * (Socio por derivación; Gerente/Senior/Staff por asignación) sí se filtran.
 */
export const ROLES_ALCANCE_GLOBAL: ReadonlySet<string> = new Set([
  "Administrador",
  "Superadministrador",
]);

/** Funciones de responsable que se asignan por cliente. */
export const FUNCIONES_ASIGNACION = ["staff", "senior", "gerente"] as const;
export type FuncionAsignacion = (typeof FUNCIONES_ASIGNACION)[number];

/** Rol de usuario → función que ocupa como responsable de cliente. */
export const FUNCION_POR_ROL: Record<string, FuncionAsignacion> = {
  Staff: "staff",
  Senior: "senior",
  Gerente: "gerente",
};

/** Rol de usuario esperado para cada función de responsable. */
export const ROL_POR_FUNCION: Record<FuncionAsignacion, string> = {
  staff: "Staff",
  senior: "Senior",
  gerente: "Gerente",
};

/** Etiquetas visibles de cada función (UI y auditoría). */
export const ETIQUETA_FUNCION: Record<FuncionAsignacion, string> = {
  staff: "Staff",
  senior: "Senior",
  gerente: "Gerente",
};

/**
 * Rol del SUPERIOR directo esperado por rol del subordinado (adyacencia).
 * Los roles ausentes (Socio, Administrador, Superadministrador, legados)
 * no reportan a nadie dentro de la jerarquía.
 */
export const ROL_SUPERIOR: Record<string, string> = {
  Gerente: "Socio",
  Senior: "Gerente",
  Staff: "Senior",
};

/** ¿La arista superior→subordinado conecta roles adyacentes válidos? */
export function esAristaValida(rolSuperior: string, rolSubordinado: string): boolean {
  return ROL_SUPERIOR[rolSubordinado] === rolSuperior;
}

/** Arista de jerarquía en forma plana (como sale de jerarquia_usuarios). */
export type Arista = { superiorId: number; subordinateId: number };

/**
 * Asignaciones SINTÉTICAS del Socio: lectura (nunca escritura) sobre los
 * clientes donde alguno de sus gerentes subordinados tiene asignación
 * vigente con función "gerente". Pura: recibe las filas ya filtradas por
 * vigencia (contexto.ts filtra fechas al leer). Dedup por clientId.
 */
export function derivarAsignacionesSocio(
  socioId: NonNullable<Asignacion["userId"]>,
  asignacionesDeGerentes: Pick<Asignacion, "clientId">[],
): Asignacion[] {
  const clientes = new Set<Asignacion["clientId"]>();
  for (const a of asignacionesDeGerentes) clientes.add(a.clientId);
  return [...clientes].map((clientId) => ({
    clientId,
    userId: socioId,
    readScope: true,
    writeScope: false,
    active: true,
  }));
}
