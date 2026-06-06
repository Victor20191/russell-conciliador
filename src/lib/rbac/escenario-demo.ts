// ============================================================
// Escenario de DEMOSTRACIÓN para validar la autorización RBAC.
//
// Reutilizado por el seed (prisma/seed-rbac.ts) y por las pruebas
// (src/lib/rbac/permisos.test.ts), de modo que la validación refleja
// EXACTAMENTE lo que se siembra en la BD.
//
// Referencia clientes REALES del seed principal (prisma/seed.ts):
//   C-1042 Inversiones del Pacífico · C-0871 Agroindustrias del Cauca
//   C-1308 Servicios Médicos Vital IPS (usado como cliente FUERA de la cartera).
//
// Cartera de prueba (segregación de funciones del PDF):
//   Equipo "Cartera Pacífico" (líder: Senior) atiende C-1042 y C-0871.
//   - Todos sus integrantes LEEN ambos clientes (asignación de equipo).
//   - Staff Uno ESCRIBE solo C-1042; Staff Dos ESCRIBE solo C-0871.
//   - Gerente y Socio LEEN la cartera (supervisión), sin escribir.
// ============================================================

export const DEMO_EQUIPO = {
  key: "team-demo-pacifico",
  name: "Equipo Demo · Cartera Pacífico",
  description: "Equipo de prueba para validar roles, permisos y alcance por cliente.",
  leadEmail: "senior.demo@russellbedford.co",
};

export type DemoUsuario = { email: string; name: string; role: string; initials: string };

export const DEMO_USUARIOS: DemoUsuario[] = [
  { email: "socio.demo@russellbedford.co", name: "Demo Socio", role: "Socio", initials: "DS" },
  { email: "gerente.demo@russellbedford.co", name: "Demo Gerente", role: "Gerente", initials: "DG" },
  { email: "senior.demo@russellbedford.co", name: "Demo Senior", role: "Senior", initials: "DN" },
  { email: "staff1.demo@russellbedford.co", name: "Demo Staff Uno", role: "Staff", initials: "S1" },
  { email: "staff2.demo@russellbedford.co", name: "Demo Staff Dos", role: "Staff", initials: "S2" },
];

// Integrantes del equipo (con su rol funcional dentro del equipo).
export const DEMO_INTEGRANTES = [
  { email: "senior.demo@russellbedford.co", roleCode: "Senior" },
  { email: "staff1.demo@russellbedford.co", roleCode: "Staff" },
  { email: "staff2.demo@russellbedford.co", roleCode: "Staff" },
];

// Quién hereda alcance por pertenecer al equipo demo.
export const DEMO_MIEMBROS_EQUIPO = DEMO_INTEGRANTES.map((m) => m.email);

// Clientes reales del seed principal usados como cartera de prueba.
export const DEMO_CLIENTE_A = "C-1042"; // Inversiones del Pacífico S.A.S
export const DEMO_CLIENTE_B = "C-0871"; // Agroindustrias del Cauca Ltda.
export const DEMO_CLIENTE_FUERA = "C-1308"; // Servicios Médicos Vital IPS (NO asignado)

export type DemoAsignacion = {
  clientCode: string;
  userEmail?: string; // asignación individual
  team?: boolean; // true → asignación a nivel de equipo (hereda a sus integrantes)
  readScope: boolean;
  writeScope: boolean;
};

export const DEMO_ASIGNACIONES: DemoAsignacion[] = [
  // Cartera del equipo: todos sus integrantes pueden LEER ambos clientes.
  { clientCode: DEMO_CLIENTE_A, team: true, readScope: true, writeScope: false },
  { clientCode: DEMO_CLIENTE_B, team: true, readScope: true, writeScope: false },
  // Staff: ESCRITURA solo sobre su cliente asignado (segregación por dato).
  { clientCode: DEMO_CLIENTE_A, userEmail: "staff1.demo@russellbedford.co", readScope: true, writeScope: true },
  { clientCode: DEMO_CLIENTE_B, userEmail: "staff2.demo@russellbedford.co", readScope: true, writeScope: true },
  // Supervisión (Gerente y Socio): LECTURA de la cartera, sin escritura.
  { clientCode: DEMO_CLIENTE_A, userEmail: "gerente.demo@russellbedford.co", readScope: true, writeScope: false },
  { clientCode: DEMO_CLIENTE_B, userEmail: "gerente.demo@russellbedford.co", readScope: true, writeScope: false },
  { clientCode: DEMO_CLIENTE_A, userEmail: "socio.demo@russellbedford.co", readScope: true, writeScope: false },
  { clientCode: DEMO_CLIENTE_B, userEmail: "socio.demo@russellbedford.co", readScope: true, writeScope: false },
];
