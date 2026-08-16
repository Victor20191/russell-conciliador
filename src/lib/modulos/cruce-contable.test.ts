import { describe, it, expect } from "vitest";
import { construirCruceContable, type ClasificadorCruce } from "./cruce-contable";

const nombrePorCuenta = (cod: string): string | null => ({ "1435": "Mercancías no fabricadas", "1430": "Materias primas" }[cod] ?? null);

describe("construirCruceContable", () => {
  it("cuadre exacto", () => {
    const consolidado: ClasificadorCruce[] = [{ clasificador: "MP", total: 1000, cuentas4: ["1435"] }];
    const r = construirCruceContable({ contablePorCuenta: { "1435": 1000 }, consolidado, nombrePorCuenta });
    expect(r.filas).toEqual([
      { cuenta4: "1435", nombre: "Mercancías no fabricadas", contable: 1000, inventario: 1000, diferencia: 0, cuadra: true, estado: "cuadra" },
    ]);
  });

  it("descuadre por encima de la tolerancia", () => {
    const consolidado: ClasificadorCruce[] = [{ clasificador: "MP", total: 900, cuentas4: ["1435"] }];
    const r = construirCruceContable({ contablePorCuenta: { "1435": 1000 }, consolidado, nombrePorCuenta });
    expect(r.filas[0].estado).toBe("descuadre");
    expect(r.filas[0].diferencia).toBe(100);
    expect(r.filas[0].cuadra).toBe(false);
  });

  it("tolerancia: diferencia mínima cuadra igual", () => {
    const consolidado: ClasificadorCruce[] = [{ clasificador: "MP", total: 999.995, cuentas4: ["1435"] }];
    const r = construirCruceContable({ contablePorCuenta: { "1435": 1000 }, consolidado, nombrePorCuenta }, { tolerancia: 0.01 });
    expect(r.filas[0].estado).toBe("cuadra");
  });

  it("solo_contable: saldo en el balance sin inventario en archivos", () => {
    const r = construirCruceContable({ contablePorCuenta: { "1435": 500 }, consolidado: [], nombrePorCuenta });
    expect(r.filas).toEqual([
      { cuenta4: "1435", nombre: "Mercancías no fabricadas", contable: 500, inventario: 0, diferencia: 500, cuadra: false, estado: "solo_contable" },
    ]);
  });

  it("solo_inventario: valor en archivos sin saldo contable", () => {
    const consolidado: ClasificadorCruce[] = [{ clasificador: "PT", total: 300, cuentas4: ["1430"] }];
    const r = construirCruceContable({ contablePorCuenta: {}, consolidado, nombrePorCuenta });
    expect(r.filas).toEqual([
      { cuenta4: "1430", nombre: "Materias primas", contable: 0, inventario: 300, diferencia: -300, cuadra: false, estado: "solo_inventario" },
    ]);
  });

  it("clasificador sin cuenta asignada va a sinCuenta y no entra en las filas", () => {
    const consolidado: ClasificadorCruce[] = [{ clasificador: "SIN-CTA", total: 250, cuentas4: [] }];
    const r = construirCruceContable({ contablePorCuenta: {}, consolidado, nombrePorCuenta });
    expect(r.filas).toEqual([]);
    expect(r.sinCuenta).toEqual([{ clasificador: "SIN-CTA", total: 250 }]);
  });

  it("clasificador con varias cuentas va a multiAsignado y no se reparte", () => {
    const consolidado: ClasificadorCruce[] = [{ clasificador: "AMBIGUO", total: 700, cuentas4: ["1430", "1435"] }];
    const r = construirCruceContable({ contablePorCuenta: {}, consolidado, nombrePorCuenta });
    expect(r.filas).toEqual([]);
    expect(r.multiAsignado).toEqual([{ clasificador: "AMBIGUO", total: 700, cuentas4: ["1430", "1435"] }]);
  });

  it("varios clasificadores 1:1 a la misma cuenta se suman", () => {
    const consolidado: ClasificadorCruce[] = [
      { clasificador: "MP-A", total: 400, cuentas4: ["1435"] },
      { clasificador: "MP-B", total: 300, cuentas4: ["1435"] },
    ];
    const r = construirCruceContable({ contablePorCuenta: { "1435": 700 }, consolidado, nombrePorCuenta });
    expect(r.filas[0]).toMatchObject({ cuenta4: "1435", contable: 700, inventario: 700, estado: "cuadra" });
  });

  it("totales suman solo las filas (no sinCuenta ni multiAsignado)", () => {
    const consolidado: ClasificadorCruce[] = [
      { clasificador: "MP", total: 1000, cuentas4: ["1435"] },
      { clasificador: "PT", total: 300, cuentas4: ["1430"] },
      { clasificador: "SIN-CTA", total: 250, cuentas4: [] },
      { clasificador: "AMBIGUO", total: 700, cuentas4: ["1430", "1435"] },
    ];
    const r = construirCruceContable({ contablePorCuenta: { "1435": 1000, "1430": 250 }, consolidado, nombrePorCuenta });
    expect(r.totales).toEqual({ contable: 1250, inventario: 1300, diferencia: -50 });
    expect(r.sinCuenta).toEqual([{ clasificador: "SIN-CTA", total: 250 }]);
    expect(r.multiAsignado).toEqual([{ clasificador: "AMBIGUO", total: 700, cuentas4: ["1430", "1435"] }]);
  });

  it("ordena las filas por cuenta4", () => {
    const consolidado: ClasificadorCruce[] = [{ clasificador: "A", total: 1, cuentas4: ["1499"] }];
    const r = construirCruceContable({ contablePorCuenta: { "1430": 1 }, consolidado, nombrePorCuenta });
    expect(r.filas.map((f) => f.cuenta4)).toEqual(["1430", "1499"]);
  });
});
