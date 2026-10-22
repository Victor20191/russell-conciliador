import { describe, expect, it } from "vitest";
import { MATRIZ } from "@/lib/rbac/catalogo";
import { ROLES_ALCANCE_GLOBAL } from "@/lib/rbac/jerarquia";
import { permisosAyuda } from "./fichas";
import { AREAS_QUIEN_HACE_QUE, quienHaceQue, type FilaQuienHaceQue } from "./quien-hace-que";
import { ORDEN_ROLES_AYUDA, ROLES_OPERACION, rolesPorPermiso } from "./roles";

const ROLES = rolesPorPermiso(MATRIZ, [], permisosAyuda());

const filas = (texto: string, opciones: { incluirTodos?: boolean; modulo?: string } = {}): FilaQuienHaceQue[] =>
  quienHaceQue(ROLES, opciones.modulo ?? "INV", { incluirTodos: opciones.incluirTodos, texto })
    .flatMap((a) => a.pantallas)
    .flatMap((p) => p.filas);

describe("«¿Quién hace qué?»", () => {
  it("las columnas son los roles de la operación, sin los administradores", () => {
    expect([...ROLES_OPERACION]).toEqual(ORDEN_ROLES_AYUDA.filter((r) => !ROLES_ALCANCE_GLOBAL.has(r)));
  });

  it("las áreas siguen el menú y cada pantalla tiene filas", () => {
    const areas = quienHaceQue(ROLES, "NOM", { incluirTodos: true });
    expect(areas.map((a) => a.titulo)).toEqual(AREAS_QUIEN_HACE_QUE.map((a) => a.titulo));
    for (const a of areas) for (const p of a.pantallas) expect(p.filas.length, p.titulo).toBeGreaterThan(0);
  });

  it("cada celda coincide con los roles de la acción", () => {
    const [cerrar] = filas("cerrar balance");
    expect(cerrar.roles).toEqual({
      Staff: { puede: false, enSusClientes: false },
      Senior: { puede: true, enSusClientes: true },
      Gerente: { puede: false, enSusClientes: false },
      Socio: { puede: false, enSusClientes: false },
    });
    const [plan] = filas("nueva subcuenta");
    expect(plan.roles.Gerente).toEqual({ puede: true, enSusClientes: false });
    expect(plan.roles.Staff.puede).toBe(false);
  });

  it("lo solo de la administración se marca así", () => {
    const soloAdmin = filas("usuario").filter((f) => f.soloAdministracion);
    expect(soloAdmin.map((f) => f.accion)).toContain("Nuevo usuario");
    for (const f of soloAdmin) expect(ROLES_OPERACION.every((r) => !f.roles[r].puede), f.accion).toBe(true);
  });

  it("por defecto oculta lo que pueden hacer los cuatro roles", () => {
    expect(filas("exportar a excel").some((f) => f.todos)).toBe(false);
    expect(filas("exportar a excel", { incluirTodos: true }).some((f) => f.todos)).toBe(true);
  });

  it("los módulos se arman con el módulo elegido", () => {
    const pantallas = (modulo: string) =>
      quienHaceQue(ROLES, modulo, { incluirTodos: true })
        .find((a) => a.titulo === "Módulos de conciliación")!
        .pantallas.map((p) => p.titulo);
    expect(pantallas("NOM")).toContain("Cargue de Nómina");
    expect(pantallas("CAR")).toContain("Cargue de Cartera");
    expect(filas("validar coherencia", { modulo: "CAR" }).length).toBeGreaterThan(0);
    expect(filas("validar coherencia", { modulo: "INV" })).toEqual([]);
  });

  it("enlaza las pantallas que tienen página propia", () => {
    const area = quienHaceQue(ROLES, "NOM", { incluirTodos: true }).find((a) => a.titulo === "Módulos de conciliación")!;
    expect(area.pantallas.find((p) => p.fichaId === "modulo.cargados")?.href).toBe("/modulos/nom");
    expect(area.pantallas.find((p) => p.fichaId === "modulo.cargue")?.href).toBeNull();
  });
});
