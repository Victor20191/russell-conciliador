// ============================================================
// Escenario de DEMOSTRACIÓN para validar la autorización RBAC.
//
// Reutilizado por el seed (prisma/seed-rbac.ts) y por las pruebas
// (src/lib/rbac/permisos.test.ts), de modo que la validación refleja
// EXACTAMENTE lo que se siembra en la BD.
//
// Referencia clientes REALES del seed principal (prisma/seed.ts):
//   C-1042 Inversiones del Pacífico · C-0871 Agroindustrias del Cauca
//   C-1308 Servicios Médicos Vital IPS (usado como cliente FUERA de alcance).
//
// Modelo de asignación DIRECTA (segregación de funciones del PDF):
//   Un cliente admite uno o varios staff (ejecutan, escritura) y un solo
//   senior (revisa, lectura) y gerente (valida, lectura), elegidos al crear
//   el cliente. Este escenario demo usa un staff por cliente.
//   El Socio NO se asigna: deriva LECTURA por jerarquía sobre los clientes
//   donde sus gerentes subordinados están asignados.
//
// Jerarquía demo: Socio → Gerente → Senior → {Staff Uno, Staff Dos}.
// ============================================================

import type { FuncionAsignacion } from "./jerarquia";

export type DemoUsuario = { email: string; name: string; role: string; initials: string };

const SOCIO = "socio.demo@russellbedford.co";
const GERENTE = "gerente.demo@russellbedford.co";
const SENIOR = "senior.demo@russellbedford.co";
const STAFF1 = "staff1.demo@russellbedford.co";
const STAFF2 = "staff2.demo@russellbedford.co";

export const DEMO_USUARIOS: DemoUsuario[] = [
  { email: SOCIO, name: "Demo Socio", role: "Socio", initials: "DS" },
  { email: GERENTE, name: "Demo Gerente", role: "Gerente", initials: "DG" },
  { email: SENIOR, name: "Demo Senior", role: "Senior", initials: "DN" },
  { email: STAFF1, name: "Demo Staff Uno", role: "Staff", initials: "S1" },
  { email: STAFF2, name: "Demo Staff Dos", role: "Staff", initials: "S2" },
];

// Aristas de jerarquía (superior → subordinado) entre roles adyacentes.
export const DEMO_JERARQUIA = [
  { superiorEmail: SOCIO, subordinadoEmail: GERENTE },
  { superiorEmail: GERENTE, subordinadoEmail: SENIOR },
  { superiorEmail: SENIOR, subordinadoEmail: STAFF1 },
  { superiorEmail: SENIOR, subordinadoEmail: STAFF2 },
];

// Clientes reales del seed principal usados como alcance de prueba.
export const DEMO_CLIENTE_A = "C-1042"; // Inversiones del Pacífico S.A.S
export const DEMO_CLIENTE_B = "C-0871"; // Agroindustrias del Cauca Ltda.
export const DEMO_CLIENTE_FUERA = "C-1308"; // Servicios Médicos Vital IPS (NO asignado)
// El Zarzal: cliente de los balances y del mapeo demo (cuentas_cliente).
export const DEMO_CLIENTE_MAPEO = "C-0644"; // El Zarzal S.A

// Responsables por cliente (el demo usa 1 por función; el formulario admite
// uno o varios staff).
export type DemoResponsables = {
  clientCode: string;
  staffEmail: string;
  seniorEmail: string;
  gerenteEmail: string;
};

export const DEMO_RESPONSABLES: DemoResponsables[] = [
  { clientCode: DEMO_CLIENTE_A, staffEmail: STAFF1, seniorEmail: SENIOR, gerenteEmail: GERENTE },
  { clientCode: DEMO_CLIENTE_B, staffEmail: STAFF2, seniorEmail: SENIOR, gerenteEmail: GERENTE },
  { clientCode: DEMO_CLIENTE_MAPEO, staffEmail: STAFF1, seniorEmail: SENIOR, gerenteEmail: GERENTE },
];

export type DemoAsignacion = {
  clientCode: string;
  userEmail: string;
  funcion: FuncionAsignacion;
  readScope: boolean;
  writeScope: boolean;
};

/**
 * Expande DEMO_RESPONSABLES a filas planas de asignación, con el alcance
 * que materializa la segregación del PDF: staff escribe, senior y gerente
 * solo leen. Es la forma que siembra el seed y consumen las pruebas.
 */
export function asignacionesDemo(): DemoAsignacion[] {
  return DEMO_RESPONSABLES.flatMap((r) => [
    { clientCode: r.clientCode, userEmail: r.staffEmail, funcion: "staff" as const, readScope: true, writeScope: true },
    { clientCode: r.clientCode, userEmail: r.seniorEmail, funcion: "senior" as const, readScope: true, writeScope: false },
    { clientCode: r.clientCode, userEmail: r.gerenteEmail, funcion: "gerente" as const, readScope: true, writeScope: false },
  ]);
}
