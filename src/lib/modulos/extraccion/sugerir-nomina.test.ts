import { describe, expect, it } from "vitest";
import type { GridHoja } from "@/lib/balance/extraccion/ingesta";
import { MODULOS_IMPORT } from "../descriptores";
import { columnaDeCorteLateral, rolesRequeridosFaltantes, sugerirSpec } from "./sugerir";
import FIXTURE from "../nomina/__fixtures__/encabezados-nom.json";

/**
 * Los encabezados REALES de los archivos de nómina de 14 clientes: lo que decide el sugeridor
 * (`sugerirSpec` + `ajustarRolesNomina`) es lo que el wizard propone sin que el usuario toque
 * nada. Cada caso fija solo los roles que importan; los demás no se verifican.
 */
const NOM = MODULOS_IMPORT.NOM;

type Caso = {
  id: string;
  cliente: string;
  hoja: string;
  header: (string | null)[];
  filas: (string | number | null)[][];
  esperado: Record<string, number>;
  faltantes: string[];
};

function hojaDe(caso: Caso): GridHoja {
  return { nombre: caso.hoja, filas: [caso.header, ...caso.filas] };
}

describe("sugeridor de Nómina sobre los encabezados reales", () => {
  for (const caso of FIXTURE.archivos as unknown as Caso[]) {
    it(`${caso.id} · ${caso.cliente}`, () => {
      const spec = sugerirSpec(NOM, hojaDe(caso));
      expect(spec.filaEncabezado).toBe(1);
      const obtenido = Object.fromEntries(Object.keys(caso.esperado).map((rol) => [rol, spec.columnas[rol] ?? 0]));
      expect(obtenido).toEqual(caso.esperado);
      expect(rolesRequeridosFaltantes(NOM, spec)).toEqual(caso.faltantes);
    });
  }

  it("el valor no falta cuando el archivo trae devengo/deducción o débito/crédito", () => {
    const spec = sugerirSpec(NOM, { nombre: "x", filas: [["Cédula", "Concepto", "Devengo", "Deducción"], [1, "Sueldo", 100, 0]] });
    expect(rolesRequeridosFaltantes(NOM, spec)).toEqual([]);
    const sinNada = sugerirSpec(NOM, { nombre: "x", filas: [["Cédula", "Concepto", "Horas"], [1, "Sueldo", 8]] });
    expect(rolesRequeridosFaltantes(NOM, sinNada)).toEqual(["valor"]);
  });
});

describe("tablas laterales pegadas al detalle", () => {
  const caso = (id: string) => (FIXTURE.archivos as unknown as Caso[]).find((c) => c.id === id)!;

  it("PLASMAR: la tabla dinámica de las columnas 28-29 no recibe ningún rol", () => {
    const spec = sugerirSpec(NOM, hojaDe(caso("plasmar-buk")));
    for (const [rol, col] of Object.entries(spec.columnas)) expect(col, rol).toBeLessThan(27);
  });

  it("Pure Nature: el resumen «Novedad | Tipo | TOTAL» de la derecha no compite con el detalle", () => {
    const spec = sugerirSpec(NOM, hojaDe(caso("pure-nature")));
    for (const [rol, col] of Object.entries(spec.columnas)) expect(col, rol).toBeLessThan(13);
    expect(spec.columnas).toMatchObject({ concepto: 9, tipo: 10, valor: 12 });
  });

  it("un hueco seguido de columnas con pocas filas es lateral; una columna vacía entre columnas del detalle no", () => {
    const header = ["Cédula", "Concepto", "Valor", null, "Concepto", "Suma de Valor"];
    const filas = Array.from({ length: 60 }, (_, i) => [1000 + i, "Sueldo", 100, null, i < 3 ? "Sueldo" : null, i < 3 ? 6000 : null]);
    expect(columnaDeCorteLateral({ nombre: "x", filas: [header, ...filas] }, { filaEncabezado: 1, primeraFilaDatos: 2 })).toBe(4);
    const sinLateral = ["Cédula", null, "Concepto", "Valor"];
    expect(columnaDeCorteLateral({ nombre: "x", filas: [sinLateral, [1, null, "Sueldo", 100]] }, { filaEncabezado: 1, primeraFilaDatos: 2 })).toBe(0);
  });
});
