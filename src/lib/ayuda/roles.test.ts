import { describe, expect, it } from "vitest";
import { MATRIZ, matrizConLegado, ROLES_MATRIZ, type Matriz } from "@/lib/rbac/catalogo";
import type { PlatformModuleState } from "@/lib/rbac/modulos-plataforma";
import { REGLAS } from "./reglas";
import {
  chipsDeRoles,
  ORDEN_ROLES_AYUDA,
  rolDelUsuarioPuede,
  rolesDeRegla,
  rolesPorPermiso,
  type RolesAyuda,
} from "./roles";
import type { Regla } from "./tipos";

type EstadoPublicacion = Pick<PlatformModuleState, "key" | "enabledForNonAdmins" | "configurableForNonAdmins">;

const PUBLICADOS: EstadoPublicacion[] = [
  { key: "balance", enabledForNonAdmins: true, configurableForNonAdmins: true },
  { key: "modulos_datos", enabledForNonAdmins: true, configurableForNonAdmins: true },
  { key: "conciliaciones", enabledForNonAdmins: true, configurableForNonAdmins: true },
  { key: "perfiles_carga", enabledForNonAdmins: true, configurableForNonAdmins: true },
];

const PERMISOS = Object.values(REGLAS).flatMap((r: Regla) => r.flatMap((v) => v.permisos));

function roles(matriz: Matriz = MATRIZ, publicacion = PUBLICADOS): RolesAyuda {
  return rolesPorPermiso(matriz, publicacion, PERMISOS);
}

const soloRoles = (regla: Regla, r: RolesAyuda = roles()) => rolesDeRegla(regla, r).map((x) => x.rol);

describe("rolesPorPermiso", () => {
  it("usa los mismos seis roles de la matriz, en orden de lectura", () => {
    expect([...ORDEN_ROLES_AYUDA].sort()).toEqual([...ROLES_MATRIZ].sort());
  });

  it("solo trae los permisos pedidos", () => {
    expect(Object.keys(rolesPorPermiso(MATRIZ, PUBLICADOS, ["balance:ver"]))).toEqual(["balance:ver"]);
  });

  it("deja fuera los roles legado y trata como vacío un rol ausente", () => {
    const r = rolesPorPermiso(matrizConLegado(), PUBLICADOS, ["balance:ver"]);
    expect(r["balance:ver"]).not.toContain("Líder");
    const sinStaff: Matriz = { ...MATRIZ };
    delete sinStaff.Staff;
    expect(rolesPorPermiso(sinStaff, PUBLICADOS, ["balance:ver"])["balance:ver"]).not.toContain("Staff");
  });

  it("un módulo en desarrollo solo lo ve el Superadministrador", () => {
    const enDesarrollo = PUBLICADOS.map((m) => (m.key === "modulos_datos" ? { ...m, enabledForNonAdmins: false } : m));
    expect(soloRoles(REGLAS.cargarModulo, roles(MATRIZ, enDesarrollo))).toEqual(["Superadministrador"]);
  });

  it("cerrar la conciliación sigue a la publicación de los módulos, no a «Conciliaciones»", () => {
    const viejasEnDesarrollo = PUBLICADOS.map((m) => (m.key === "conciliaciones" ? { ...m, enabledForNonAdmins: false } : m));
    expect(soloRoles(REGLAS.cerrarConciliacion, roles(MATRIZ, viejasEnDesarrollo))).toEqual(["Senior", "Gerente", "Superadministrador"]);
  });
});

describe("rolesDeRegla con la matriz del catálogo", () => {
  it("cerrar el balance: senior en sus clientes y administradores en todos", () => {
    expect(rolesDeRegla(REGLAS.revisarBalance, roles())).toEqual([
      { rol: "Senior", alcance: "propios" },
      { rol: "Administrador", alcance: "todos" },
      { rol: "Superadministrador", alcance: "todos" },
    ]);
  });

  it("eliminar un balance acepta cualquiera de sus dos permisos", () => {
    expect(soloRoles(REGLAS.eliminarBalance)).toEqual(["Senior", "Administrador", "Superadministrador"]);
    expect(soloRoles(REGLAS.eliminarHistorialBalance)).toEqual(["Administrador", "Superadministrador"]);
  });

  it("el historial del módulo con perfiles exige los dos permisos", () => {
    expect(soloRoles(REGLAS.eliminarModulo)).toEqual(["Senior", "Administrador", "Superadministrador"]);
    expect(soloRoles(REGLAS.eliminarHistorialModulo)).toEqual(["Administrador", "Superadministrador"]);
  });

  it("cerrar la conciliación: senior, gerente y superadministrador (el Administrador no)", () => {
    expect(soloRoles(REGLAS.cerrarConciliacion)).toEqual(["Senior", "Gerente", "Superadministrador"]);
  });

  it("comentar las alertas del módulo: quien edita o el senior/gerente asignado", () => {
    expect(soloRoles(REGLAS.comentarAlertaModulo)).toEqual(["Staff", "Senior", "Gerente", "Administrador", "Superadministrador"]);
  });

  it("el alcance de escritura deja fuera al Gerente aunque la matriz le dé el permiso", () => {
    const conGerente: Matriz = { ...MATRIZ, Gerente: [...(MATRIZ.Gerente ?? []), "balance:crear"] };
    expect(soloRoles(REGLAS.cargarBalance, roles(conGerente))).toEqual(["Staff", "Senior", "Administrador", "Superadministrador"]);
  });

  it("una acción que no depende del cliente no lleva alcance", () => {
    expect(rolesDeRegla(REGLAS.verPatrones, roles()).every((r) => r.alcance === null)).toBe(true);
  });
});

describe("rolDelUsuarioPuede", () => {
  it("con un rol de la matriz coincide con los chips", () => {
    expect(rolDelUsuarioPuede(REGLAS.revisarBalance, "Senior", roles(), [])).toBe(true);
    expect(rolDelUsuarioPuede(REGLAS.revisarBalance, "Staff", roles(), MATRIZ.Staff ?? [])).toBe(false);
  });

  it("un rol legado usa sus propios permisos", () => {
    const lider = matrizConLegado()["Líder"] ?? [];
    expect(rolDelUsuarioPuede(REGLAS.revisarBalance, "Líder", roles(), lider)).toBe(true);
    // Un Líder no se asigna a clientes como staff o senior: no tiene alcance de escritura.
    expect(rolDelUsuarioPuede(REGLAS.cargarBalance, "Líder", roles(), lider)).toBe(false);
  });
});

describe("chipsDeRoles", () => {
  it("los seis roles se resumen en «Todos los roles»", () => {
    expect(chipsDeRoles(rolesDeRegla(REGLAS.verBalance, roles()))).toEqual([
      { texto: "Todos los roles", detalle: "cada uno en los clientes que consulta" },
    ]);
  });

  it("lista solo los roles de la operación, cada uno con sobre qué clientes puede", () => {
    expect(chipsDeRoles(rolesDeRegla(REGLAS.revisarBalance, roles()))).toEqual([{ texto: "Senior", detalle: "sus clientes" }]);
    expect(chipsDeRoles(rolesDeRegla(REGLAS.cerrarConciliacion, roles()))).toEqual([
      { texto: "Senior", detalle: "sus clientes" },
      { texto: "Gerente", detalle: "sus clientes" },
    ]);
  });

  it("los cuatro roles de la operación se resumen en «Todos los roles» aunque falten los administradores", () => {
    const sinAdmins = rolesDeRegla(REGLAS.verBalance, roles()).filter((r) => r.alcance !== "todos");
    expect(chipsDeRoles(sinAdmins)).toEqual([{ texto: "Todos los roles", detalle: "cada uno en los clientes que consulta" }]);
  });

  it("una acción solo de la administración lo dice, en vez de quedar sin roles", () => {
    expect(chipsDeRoles(rolesDeRegla(REGLAS.eliminarHistorialBalance, roles()))).toEqual([{ texto: "Solo administradores", detalle: null }]);
    const enDesarrollo = PUBLICADOS.map((m) => (m.key === "modulos_datos" ? { ...m, enabledForNonAdmins: false } : m));
    expect(chipsDeRoles(rolesDeRegla(REGLAS.cargarModulo, roles(MATRIZ, enDesarrollo)))).toEqual([
      { texto: "Solo el Superadministrador", detalle: null },
    ]);
    expect(chipsDeRoles([])).toEqual([]);
  });

  it("ocultar a los administradores no les quita la acción", () => {
    expect(soloRoles(REGLAS.revisarBalance)).toContain("Administrador");
    expect(rolDelUsuarioPuede(REGLAS.revisarBalance, "Administrador", roles(), MATRIZ.Administrador ?? [])).toBe(true);
  });
});
