// ============================================================
// Fixture exclusivo de las pruebas de autorización RBAC.
// No lo importa el código de ejecución ni ningún inicializador de BD.
// Los usuarios y clientes son identificadores de prueba sin relación con
// personas, clientes o credenciales de una instalación.
//
// Modelo de asignación DIRECTA (segregación de funciones del PDF):
//   Un cliente admite uno o varios staff (ejecutan, escritura) y un solo
//   senior (revisa, lectura) y gerente (valida, lectura), elegidos al crear
//   el cliente. Este escenario usa un staff por cliente.
//   El Socio NO se asigna: deriva LECTURA por jerarquía sobre los clientes
//   donde sus gerentes subordinados están asignados.
//
// Jerarquía de prueba: Socio → Gerente → Senior → {Staff Uno, Staff Dos}.
// ============================================================

import type { FuncionAsignacion } from "../jerarquia";

export type PruebaUsuario = { email: string; name: string; role: string; initials: string };

const SOCIO = "socio@rbac.test";
const GERENTE = "gerente@rbac.test";
const SENIOR = "senior@rbac.test";
const STAFF1 = "staff1@rbac.test";
const STAFF2 = "staff2@rbac.test";

export const PRUEBA_USUARIOS: PruebaUsuario[] = [
  { email: SOCIO, name: "Prueba Socio", role: "Socio", initials: "PS" },
  { email: GERENTE, name: "Prueba Gerente", role: "Gerente", initials: "PG" },
  { email: SENIOR, name: "Prueba Senior", role: "Senior", initials: "PN" },
  { email: STAFF1, name: "Prueba Staff Uno", role: "Staff", initials: "S1" },
  { email: STAFF2, name: "Prueba Staff Dos", role: "Staff", initials: "S2" },
];

// Aristas de jerarquía (superior → subordinado) entre roles adyacentes.
export const PRUEBA_JERARQUIA = [
  { superiorEmail: SOCIO, subordinadoEmail: GERENTE },
  { superiorEmail: GERENTE, subordinadoEmail: SENIOR },
  { superiorEmail: SENIOR, subordinadoEmail: STAFF1 },
  { superiorEmail: SENIOR, subordinadoEmail: STAFF2 },
];

// Clientes del escenario; el tercero queda fuera de las asignaciones.
export const PRUEBA_CLIENTE_A = "CLIENTE-A";
export const PRUEBA_CLIENTE_B = "CLIENTE-B";
export const PRUEBA_CLIENTE_FUERA = "CLIENTE-FUERA";
export const PRUEBA_CLIENTE_MAPEO = "CLIENTE-MAPEO";

// Responsables por cliente (el escenario usa 1 por función; el formulario admite
// uno o varios staff).
export type PruebaResponsables = {
  clientCode: string;
  staffEmail: string;
  seniorEmail: string;
  gerenteEmail: string;
};

export const PRUEBA_RESPONSABLES: PruebaResponsables[] = [
  { clientCode: PRUEBA_CLIENTE_A, staffEmail: STAFF1, seniorEmail: SENIOR, gerenteEmail: GERENTE },
  { clientCode: PRUEBA_CLIENTE_B, staffEmail: STAFF2, seniorEmail: SENIOR, gerenteEmail: GERENTE },
  { clientCode: PRUEBA_CLIENTE_MAPEO, staffEmail: STAFF1, seniorEmail: SENIOR, gerenteEmail: GERENTE },
];

export type PruebaAsignacion = {
  clientCode: string;
  userEmail: string;
  funcion: FuncionAsignacion;
  readScope: boolean;
  writeScope: boolean;
};

/**
 * Expande PRUEBA_RESPONSABLES a filas planas de asignación, con el alcance
 * que materializa la segregación del PDF: staff escribe, senior y gerente
 * solo leen. Estos datos se consumen únicamente desde las pruebas.
 */
export function asignacionesPrueba(): PruebaAsignacion[] {
  return PRUEBA_RESPONSABLES.flatMap((r) => [
    { clientCode: r.clientCode, userEmail: r.staffEmail, funcion: "staff" as const, readScope: true, writeScope: true },
    { clientCode: r.clientCode, userEmail: r.seniorEmail, funcion: "senior" as const, readScope: true, writeScope: false },
    { clientCode: r.clientCode, userEmail: r.gerenteEmail, funcion: "gerente" as const, readScope: true, writeScope: false },
  ]);
}
