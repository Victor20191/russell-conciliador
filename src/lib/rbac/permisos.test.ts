import { test, expect, describe } from "vitest";
import { MATRIZ, PERMISOS, ROLES, ROLES_PDF } from "./catalogo";
import { puedeSobreCliente, tienePermiso, type Asignacion } from "./permisos";
import {
  DEMO_EQUIPO,
  DEMO_USUARIOS,
  DEMO_ASIGNACIONES,
  DEMO_MIEMBROS_EQUIPO,
  DEMO_CLIENTE_A,
  DEMO_CLIENTE_B,
  DEMO_CLIENTE_FUERA,
} from "./escenario-demo";

// Traduce el escenario demo a asignaciones que entiende el resolver,
// usando el email como id de usuario (en BD será el id real; la lógica
// es idéntica).
const asignaciones: Asignacion[] = DEMO_ASIGNACIONES.map((a) => ({
  clientId: a.clientCode,
  userId: a.userEmail ?? null,
  teamId: a.team ? DEMO_EQUIPO.key : null,
  readScope: a.readScope,
  writeScope: a.writeScope,
  active: true,
}));

const rolDe = (email: string) => DEMO_USUARIOS.find((u) => u.email === email)!.role;
const equiposDe = (email: string) =>
  DEMO_MIEMBROS_EQUIPO.includes(email) ? [DEMO_EQUIPO.key] : [];

// Atajo: ¿este usuario puede realizar la acción sobre el cliente?
function puede(email: string, permiso: string, clientId: string) {
  return puedeSobreCliente({
    matriz: MATRIZ,
    roleCode: rolDe(email),
    userId: email,
    permiso,
    clientId,
    asignaciones,
    equiposDelUsuario: equiposDe(email),
  });
}

const SOCIO = "socio.demo@russellbedford.co";
const GERENTE = "gerente.demo@russellbedford.co";
const SENIOR = "senior.demo@russellbedford.co";
const STAFF1 = "staff1.demo@russellbedford.co";
const STAFF2 = "staff2.demo@russellbedford.co";

describe("Integridad del catálogo RBAC", () => {
  test("todos los permisos referencian roles válidos del PDF", () => {
    const validos = new Set<string>(ROLES_PDF);
    for (const p of PERMISOS) {
      for (const r of p.roles) expect(validos.has(r)).toBe(true);
    }
  });

  test("los códigos de permiso son únicos", () => {
    const codes = PERMISOS.map((p) => p.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  test("cada rol del PDF tiene al menos un permiso en la matriz", () => {
    for (const r of ROLES_PDF) expect((MATRIZ[r] ?? []).length).toBeGreaterThan(0);
  });

  test("los roles legado siguen presentes (no se huerfanan usuarios)", () => {
    const codes = new Set(ROLES.map((r) => r.code));
    for (const legado of ["Consulta", "Auditor", "Líder", "Administrador"]) {
      expect(codes.has(legado)).toBe(true);
    }
  });
});

describe("Segregación operativa — Staff es el ÚNICO que escribe", () => {
  test("Staff escribe (ejecuta conciliación) SOLO sobre su cliente asignado", () => {
    expect(puede(STAFF1, "conciliaciones:ejecutar", DEMO_CLIENTE_A)).toBe(true); // suyo
    expect(puede(STAFF1, "conciliaciones:ejecutar", DEMO_CLIENTE_B)).toBe(false); // del otro Staff
    expect(puede(STAFF2, "conciliaciones:ejecutar", DEMO_CLIENTE_B)).toBe(true); // suyo
    expect(puede(STAFF2, "conciliaciones:ejecutar", DEMO_CLIENTE_A)).toBe(false);
  });

  test("Senior/Gerente/Socio NO pueden ejecutar (no tienen permiso operativo)", () => {
    for (const u of [SENIOR, GERENTE, SOCIO]) {
      expect(puede(u, "conciliaciones:ejecutar", DEMO_CLIENTE_A)).toBe(false);
    }
  });

  test("nadie escribe un cliente fuera de su cartera", () => {
    expect(puede(STAFF1, "conciliaciones:ejecutar", DEMO_CLIENTE_FUERA)).toBe(false);
  });
});

describe("Lectura y cartera — alcance por dato", () => {
  test("el Staff LEE ambos clientes del equipo (herencia por equipo)", () => {
    expect(puede(STAFF1, "conciliaciones:ver", DEMO_CLIENTE_A)).toBe(true);
    expect(puede(STAFF1, "conciliaciones:ver", DEMO_CLIENTE_B)).toBe(true); // lee aunque no escriba
  });

  test("nadie ve un cliente fuera de su cartera", () => {
    expect(puede(STAFF1, "conciliaciones:ver", DEMO_CLIENTE_FUERA)).toBe(false);
    expect(puede(SENIOR, "conciliaciones:ver", DEMO_CLIENTE_FUERA)).toBe(false);
  });
});

describe("Revisión y supervisión", () => {
  test("Senior revisa conciliaciones de su cartera, pero no de clientes ajenos", () => {
    expect(puede(SENIOR, "conciliaciones:revisar", DEMO_CLIENTE_A)).toBe(true);
    expect(puede(SENIOR, "conciliaciones:revisar", DEMO_CLIENTE_FUERA)).toBe(false);
  });

  test("el Staff NO revisa (no es su función)", () => {
    expect(puede(STAFF1, "conciliaciones:revisar", DEMO_CLIENTE_A)).toBe(false);
  });

  test("supervisar cartera es de Gerente y Socio (no Senior ni Staff)", () => {
    expect(tienePermiso(MATRIZ, "Gerente", "clientes:supervisar")).toBe(true);
    expect(tienePermiso(MATRIZ, "Socio", "clientes:supervisar")).toBe(true);
    expect(tienePermiso(MATRIZ, "Senior", "clientes:supervisar")).toBe(false);
    expect(tienePermiso(MATRIZ, "Staff", "clientes:supervisar")).toBe(false);
    expect(puede(GERENTE, "clientes:supervisar", DEMO_CLIENTE_A)).toBe(true); // lectura sobre su cartera
  });
});

describe("Permisos globales (sin alcance de cliente)", () => {
  test("configurar clientes y armar equipos/cartera: Senior (negocio) y Administrador (plataforma)", () => {
    for (const r of ["Senior", "Administrador"]) {
      expect(tienePermiso(MATRIZ, r, "clientes:configurar")).toBe(true);
      expect(tienePermiso(MATRIZ, r, "equipos:asignar")).toBe(true);
    }
    // El resto (consulta/operación) no arma cartera.
    for (const r of ["Socio", "Gerente", "Staff"]) {
      expect(tienePermiso(MATRIZ, r, "equipos:asignar")).toBe(false);
    }
  });

  test("administrar la herramienta (usuarios/módulos) es SOLO del Administrador", () => {
    expect(tienePermiso(MATRIZ, "Administrador", "usuarios:crear")).toBe(true);
    expect(tienePermiso(MATRIZ, "Administrador", "modulos:configurar")).toBe(true);
    for (const r of ["Socio", "Gerente", "Senior", "Staff"]) {
      expect(tienePermiso(MATRIZ, r, "usuarios:crear")).toBe(false);
    }
  });

  test("la lectura general está disponible para todos los roles del PDF", () => {
    for (const r of ROLES_PDF) expect(tienePermiso(MATRIZ, r, "conciliaciones:ver")).toBe(true);
  });
});
