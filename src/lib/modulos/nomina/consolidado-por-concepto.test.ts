import { describe, expect, it } from "vitest";
import { agruparConsolidadoPorConcepto, resumirGrupoConcepto, type RenglonConsolidadoVista } from "./consolidado-por-concepto";

const renglon = (clasificador: string, total: number, extra: Partial<RenglonConsolidadoVista> = {}): RenglonConsolidadoVista => ({
  clasificador, total, filas: 1, ...extra,
});

// MELONN: el archivo parte «1 SUELDO» en tres cuentas del cliente.
const SUELDO = [
  renglon("1 # 51050605", 2_471_815_002, { codigo: "1", descripcion: "SUELDO", cuentaArchivo: "51050605", filas: 107 }),
  renglon("1 # 52050605", 1_077_198_523, { codigo: "1", descripcion: "SUELDO", cuentaArchivo: "52050605", filas: 51 }),
  renglon("1 # 61050605", 874_047_486, { codigo: "1", descripcion: "SUELDO", cuentaArchivo: "61050605", filas: 131 }),
];

describe("Consolidado agrupado por concepto", () => {
  it("junta los renglones del mismo concepto partidos por la cuenta del archivo", () => {
    const grupos = agruparConsolidadoPorConcepto([...SUELDO, renglon("10 # 25050201", 100, { codigo: "10", cuentaArchivo: "25050201" })]);
    expect(grupos.map((g) => g.filas.length)).toEqual([3, 1]);
    expect(grupos[0].filas.map((f) => f.cuentaArchivo)).toEqual(["51050605", "52050605", "61050605"]);
  });

  it("no junta conceptos de centros distintos ni renglones sin cuenta del archivo", () => {
    const grupos = agruparConsolidadoPorConcepto([
      renglon("1 ∥ GYA # 51050605", 10, { codigo: "1", agrupador: "GYA", cuentaArchivo: "51050605" }),
      renglon("1 ∥ MOD # 72050605", 20, { codigo: "1", agrupador: "MOD", cuentaArchivo: "72050605" }),
      renglon("MERCANCÍA", 30),
      renglon("MATERIA PRIMA", 40),
    ]);
    expect(grupos.map((g) => g.filas.length)).toEqual([1, 1, 1, 1]);
    expect(grupos.map((g) => g.clave)).toEqual(["1\u0000GYA", "1\u0000MOD", "MERCANCÍA", "MATERIA PRIMA"]);
  });

  it("el resumen suma el concepto y dice qué cuenta del archivo va a qué cuenta Russell", () => {
    const russell: Record<string, string[]> = {
      "1 # 51050605": ["510506"],
      "1 # 52050605": ["520506"],
      "1 # 61050605": [],
    };
    const r = resumirGrupoConcepto(agruparConsolidadoPorConcepto(SUELDO)[0], (clave) => russell[clave] ?? []);
    expect(r).toMatchObject({ codigo: "1", agrupador: "", descripcion: "SUELDO", total: 4_423_061_011, filas: 289 });
    expect(r.cuentas).toEqual([
      { clasificador: "1 # 51050605", cuentaArchivo: "51050605", russell: ["510506"], total: 2_471_815_002 },
      { clasificador: "1 # 52050605", cuentaArchivo: "52050605", russell: ["520506"], total: 1_077_198_523 },
      { clasificador: "1 # 61050605", cuentaArchivo: "61050605", russell: [], total: 874_047_486 },
    ]);
  });

  it("la suma del renglón único es la de sus cuentas", () => {
    const r = resumirGrupoConcepto(agruparConsolidadoPorConcepto(SUELDO)[0], () => []);
    expect(r.total).toBe(r.cuentas.reduce((s, c) => s + c.total, 0));
  });
});
