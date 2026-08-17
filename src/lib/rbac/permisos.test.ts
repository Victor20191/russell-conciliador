import { test, expect, describe } from "vitest";
import { MATRIZ, PERMISOS, ROLES, ROLES_MATRIZ, ROLES_PDF } from "./catalogo";
import { puedeSobreCliente, tienePermiso, type Asignacion } from "./permisos";
import { derivarAsignacionesSocio, ROLES_ALCANCE_GLOBAL } from "./jerarquia";
import {
  DEMO_USUARIOS,
  asignacionesDemo,
  DEMO_CLIENTE_A,
  DEMO_CLIENTE_B,
  DEMO_CLIENTE_FUERA,
  DEMO_CLIENTE_MAPEO,
} from "./escenario-demo";

const SOCIO = "socio.demo@russellbedford.co";
const GERENTE = "gerente.demo@russellbedford.co";
const SENIOR = "senior.demo@russellbedford.co";
const STAFF1 = "staff1.demo@russellbedford.co";
const STAFF2 = "staff2.demo@russellbedford.co";

// Traduce el escenario demo a asignaciones que entiende el resolver,
// usando el email como id de usuario (en BD será el id real; la lógica
// es idéntica).
const directas: Asignacion[] = asignacionesDemo().map((a) => ({
  clientId: a.clientCode,
  userId: a.userEmail,
  readScope: a.readScope,
  writeScope: a.writeScope,
  active: true,
}));

// El Socio no tiene asignación directa: deriva LECTURA de los clientes de
// su gerente subordinado (igual que getAsignacionesUsuario en runtime).
const deGerentes = directas.filter((a) => a.userId === GERENTE);
const asignaciones: Asignacion[] = [
  ...directas,
  ...derivarAsignacionesSocio(SOCIO, deGerentes),
];

const rolDe = (email: string) => DEMO_USUARIOS.find((u) => u.email === email)!.role;

// Atajo: ¿este usuario puede realizar la acción sobre el cliente?
function puede(email: string, permiso: string, clientId: string) {
  return puedeSobreCliente({
    matriz: MATRIZ,
    roleCode: rolDe(email),
    userId: email,
    permiso,
    clientId,
    asignaciones,
  });
}

describe("Integridad del catálogo RBAC", () => {
  test("todos los permisos referencian roles válidos del catálogo", () => {
    const validos = new Set<string>(ROLES.map((r) => r.code));
    for (const p of PERMISOS) {
      for (const r of p.roles) expect(validos.has(r)).toBe(true);
    }
  });

  test("los códigos de permiso son únicos", () => {
    const codes = PERMISOS.map((p) => p.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  test("cada rol de la matriz tiene al menos un permiso", () => {
    for (const r of ROLES_MATRIZ) expect((MATRIZ[r] ?? []).length).toBeGreaterThan(0);
  });

  test("los roles legado siguen presentes (no se huerfanan usuarios)", () => {
    const codes = new Set(ROLES.map((r) => r.code));
    for (const legado of ["Consulta", "Auditor", "Líder", "Administrador", "Superadministrador"]) {
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

  test("nadie escribe un cliente fuera de su alcance", () => {
    expect(puede(STAFF1, "conciliaciones:ejecutar", DEMO_CLIENTE_FUERA)).toBe(false);
  });
});

describe("Lectura — alcance por dato (asignación directa, sin equipos)", () => {
  test("el Staff LEE solo los clientes donde es el responsable asignado", () => {
    expect(puede(STAFF1, "conciliaciones:ver", DEMO_CLIENTE_A)).toBe(true);
    expect(puede(STAFF1, "conciliaciones:ver", DEMO_CLIENTE_MAPEO)).toBe(true);
    expect(puede(STAFF1, "conciliaciones:ver", DEMO_CLIENTE_B)).toBe(false); // ya no hay herencia por equipo
    expect(puede(STAFF2, "conciliaciones:ver", DEMO_CLIENTE_B)).toBe(true);
  });

  test("nadie ve un cliente fuera de su alcance", () => {
    expect(puede(STAFF1, "conciliaciones:ver", DEMO_CLIENTE_FUERA)).toBe(false);
    expect(puede(SENIOR, "conciliaciones:ver", DEMO_CLIENTE_FUERA)).toBe(false);
  });
});

describe("Revisión, validación y supervisión", () => {
  test("Senior revisa conciliaciones de sus clientes, pero no de clientes ajenos", () => {
    expect(puede(SENIOR, "conciliaciones:revisar", DEMO_CLIENTE_A)).toBe(true);
    expect(puede(SENIOR, "conciliaciones:revisar", DEMO_CLIENTE_B)).toBe(true);
    expect(puede(SENIOR, "conciliaciones:revisar", DEMO_CLIENTE_FUERA)).toBe(false);
  });

  test("el Staff NO revisa (no es su función)", () => {
    expect(puede(STAFF1, "conciliaciones:revisar", DEMO_CLIENTE_A)).toBe(false);
  });

  test("el Gerente (valida) LEE los clientes donde está asignado, sin escribir", () => {
    expect(puede(GERENTE, "conciliaciones:ver", DEMO_CLIENTE_A)).toBe(true);
    expect(puede(GERENTE, "conciliaciones:ver", DEMO_CLIENTE_B)).toBe(true);
    expect(puede(GERENTE, "conciliaciones:ejecutar", DEMO_CLIENTE_A)).toBe(false);
  });

  test("supervisar cartera es de Gerente y Socio (no Senior ni Staff)", () => {
    expect(tienePermiso(MATRIZ, "Gerente", "clientes:supervisar")).toBe(true);
    expect(tienePermiso(MATRIZ, "Socio", "clientes:supervisar")).toBe(true);
    expect(tienePermiso(MATRIZ, "Senior", "clientes:supervisar")).toBe(false);
    expect(tienePermiso(MATRIZ, "Staff", "clientes:supervisar")).toBe(false);
    expect(puede(GERENTE, "clientes:supervisar", DEMO_CLIENTE_A)).toBe(true); // lectura sobre su cliente
  });
});

describe("Socio — alcance DERIVADO por jerarquía (no se asigna por cliente)", () => {
  test("lee los clientes donde su gerente subordinado está asignado", () => {
    expect(puede(SOCIO, "conciliaciones:ver", DEMO_CLIENTE_A)).toBe(true);
    expect(puede(SOCIO, "conciliaciones:ver", DEMO_CLIENTE_B)).toBe(true);
    expect(puede(SOCIO, "conciliaciones:ver", DEMO_CLIENTE_MAPEO)).toBe(true);
  });

  test("no ve clientes fuera de la cartera de sus gerentes", () => {
    expect(puede(SOCIO, "conciliaciones:ver", DEMO_CLIENTE_FUERA)).toBe(false);
  });

  test("la derivación NUNCA concede escritura", () => {
    const sinteticas = derivarAsignacionesSocio(SOCIO, deGerentes);
    expect(sinteticas.length).toBeGreaterThan(0);
    for (const a of sinteticas) {
      expect(a.writeScope).toBe(false);
      expect(a.readScope).toBe(true);
      expect(a.userId).toBe(SOCIO);
    }
  });
});

describe("Permisos globales (sin alcance de cliente)", () => {
  test("configurar clientes y asignar responsables: Senior (negocio) y Administrador (plataforma)", () => {
    for (const r of ["Senior", "Administrador"]) {
      expect(tienePermiso(MATRIZ, r, "clientes:configurar")).toBe(true);
      expect(tienePermiso(MATRIZ, r, "clientes:editar")).toBe(true);
    }
    // El resto (consulta/operación) no configura clientes.
    for (const r of ["Socio", "Gerente", "Staff"]) {
      expect(tienePermiso(MATRIZ, r, "clientes:configurar")).toBe(false);
    }
  });

  test("administrar la herramienta (usuarios/módulos) es de roles administrativos", () => {
    for (const r of ["Administrador", "Superadministrador"]) {
      expect(tienePermiso(MATRIZ, r, "usuarios:crear")).toBe(true);
      expect(tienePermiso(MATRIZ, r, "modulos:configurar")).toBe(true);
    }
    expect(tienePermiso(MATRIZ, "Superadministrador", "publicacion_modulos:configurar")).toBe(true);
    expect(tienePermiso(MATRIZ, "Administrador", "publicacion_modulos:configurar")).toBe(false);
    for (const r of ["Socio", "Gerente", "Senior", "Staff"]) {
      expect(tienePermiso(MATRIZ, r, "usuarios:crear")).toBe(false);
      expect(tienePermiso(MATRIZ, r, "publicacion_modulos:configurar")).toBe(false);
    }
  });

  test("el borrado destructivo de balances y perfiles inicia solo en roles administrativos", () => {
    for (const r of ["Administrador", "Superadministrador"]) {
      expect(tienePermiso(MATRIZ, r, "balance:eliminar")).toBe(true);
    }
    for (const r of ["Socio", "Gerente", "Senior", "Staff"]) {
      expect(tienePermiso(MATRIZ, r, "balance:eliminar")).toBe(false);
    }
  });

  test("cualquier rol autenticado puede ver y crear reportes; la bandeja es administrativa", () => {
    for (const r of ROLES_MATRIZ) {
      expect(tienePermiso(MATRIZ, r, "soporte:ver")).toBe(true);
      expect(tienePermiso(MATRIZ, r, "soporte:crear")).toBe(true);
    }
    for (const r of ["Administrador", "Superadministrador"]) {
      expect(tienePermiso(MATRIZ, r, "soporte:administrar")).toBe(true);
    }
    for (const r of ["Socio", "Gerente", "Senior", "Staff"]) {
      expect(tienePermiso(MATRIZ, r, "soporte:administrar")).toBe(false);
    }
  });

  test("la lectura general está disponible para todos los roles del PDF", () => {
    for (const r of ROLES_PDF) expect(tienePermiso(MATRIZ, r, "conciliaciones:ver")).toBe(true);
  });
});

describe("Administración de clientes — alcance por MEMBRESÍA (override de modo)", () => {
  // El Senior tiene clientes:editar pero writeScope=false sobre sus clientes:
  // por defecto (modo escritura inferido) sería denegado; con modo "lectura"
  // (membresía) administra los clientes donde es el responsable asignado.
  const ctx = (email: string, permiso: string, clientId: string) => ({
    matriz: MATRIZ,
    roleCode: rolDe(email),
    userId: email,
    permiso,
    clientId,
    asignaciones,
  });

  test("sin override, editar cliente infiere ESCRITURA y deniega al Senior (writeScope=false)", () => {
    expect(puedeSobreCliente(ctx(SENIOR, "clientes:editar", DEMO_CLIENTE_A))).toBe(false);
  });

  test("con modo 'lectura' (membresía) el Senior administra los clientes donde es responsable", () => {
    expect(puedeSobreCliente(ctx(SENIOR, "clientes:editar", DEMO_CLIENTE_A), "lectura")).toBe(true);
    expect(puedeSobreCliente(ctx(SENIOR, "clientes:editar", DEMO_CLIENTE_B), "lectura")).toBe(true);
  });

  test("el override NO concede acceso fuera de la cartera del Senior", () => {
    expect(puedeSobreCliente(ctx(SENIOR, "clientes:editar", DEMO_CLIENTE_FUERA), "lectura")).toBe(false);
  });

  test("el override de lectura no salta el permiso de rol (un Staff no administra clientes)", () => {
    expect(puedeSobreCliente(ctx(STAFF1, "clientes:editar", DEMO_CLIENTE_A), "lectura")).toBe(false);
  });
});

describe("Roles de alcance global (no se filtran por cartera)", () => {
  test("son exactamente Administrador y Superadministrador", () => {
    expect(ROLES_ALCANCE_GLOBAL.has("Administrador")).toBe(true);
    expect(ROLES_ALCANCE_GLOBAL.has("Superadministrador")).toBe(true);
    for (const r of ["Socio", "Gerente", "Senior", "Staff"]) {
      expect(ROLES_ALCANCE_GLOBAL.has(r)).toBe(false);
    }
  });
});
