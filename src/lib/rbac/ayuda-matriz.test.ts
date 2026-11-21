import { describe, expect, it } from "vitest";
import { configNav, workNav } from "@/lib/nav";
import { PERMISOS } from "./catalogo";
import { ARBOL_MODULOS } from "./niveles";
import { ayudaFilaMatriz, NOTAS_MATRIZ, pantallasDeModulo } from "./ayuda-matriz";

const NAV = [...workNav, ...configNav];
const delCatalogo = (modulo: string) => PERMISOS.filter((p) => p.module === modulo).map((p) => ({ code: p.code, action: p.action, label: p.label }));

describe("ayuda de la matriz de permisos", () => {
  it("Mapeo plan estándar abarca el Plan Estándar Russell y Mapeo cuentas cliente", () => {
    expect(pantallasDeModulo("mapeo", NAV)).toEqual(["Plan Estándar Russell", "Mapeo cuentas cliente"]);
  });

  it("los niveles listan sus permisos y omiten el que ninguna pantalla usa", () => {
    const ayuda = ayudaFilaMatriz("mapeo", delCatalogo("mapeo"), NAV);
    expect(ayuda.niveles).toEqual([
      { nivel: "ver", permisos: ["Ver mapeo del plan estándar"] },
      { nivel: "administrar", permisos: ["Administrar plan estándar Russell"] },
    ]);
    expect(ayuda.nota).toContain("Mapeo cuentas cliente");
  });

  it("una entrada con hijos se nombra con ellos, y las pantallas de otra sección también cuentan", () => {
    const impuestos = pantallasDeModulo("impuestos", NAV);
    expect(impuestos[0]).toBe("Impuestos · DIAN (Retención en la fuente, IVA, RST - Anticipos bimestrales)");
    expect(impuestos).toEqual(expect.arrayContaining(["Mapeo cuentas DIAN", "Calendario tributario"]));
    // «Borrador Balance» se abre también con «Revisar balance» (permiso alterno).
    expect(pantallasDeModulo("balance", NAV)).toEqual(["Balance de comprobación (Balance, Borrador Balance)"]);
  });

  it("todos los renglones de la matriz tienen alguna ayuda, y las notas son de renglones que existen", () => {
    const renglones = ARBOL_MODULOS.flatMap((g) => g.items.flatMap((i) => [i.module, ...(i.hijos ?? []).map((h) => h.module)]));
    for (const modulo of renglones) {
      const ayuda = ayudaFilaMatriz(modulo, delCatalogo(modulo), NAV);
      expect(ayuda.pantallas.length + (ayuda.nota ? 1 : 0), modulo).toBeGreaterThan(0);
    }
    for (const modulo of Object.keys(NOTAS_MATRIZ)) expect(renglones).toContain(modulo);
  });
});
