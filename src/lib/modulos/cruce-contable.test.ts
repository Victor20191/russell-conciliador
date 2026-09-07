import { describe, it, expect } from "vitest";
import { construirCruceContable, type ClasificadorCruce } from "./cruce-contable";

const nombrePorCuenta = (cod: string): string | null => ({ "1435": "Mercancías no fabricadas", "1430": "Materias primas" }[cod] ?? null);

describe("construirCruceContable", () => {
  it("cuadre exacto", () => {
    const consolidado: ClasificadorCruce[] = [{ clasificador: "MP", total: 1000, cuentas4: ["1435"] }];
    const r = construirCruceContable({ contablePorCuenta: { "1435": 1000 }, consolidado, nombrePorCuenta });
    expect(r.filas).toEqual([
      { cuenta4: "1435", nombre: "Mercancías no fabricadas", contable: 1000, inventario: 1000, noModular: 0, diferenciaBruta: 0, diferencia: 0, cuadra: true, estado: "cuadra" },
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
      { cuenta4: "1435", nombre: "Mercancías no fabricadas", contable: 500, inventario: 0, noModular: 0, diferenciaBruta: 500, diferencia: 500, cuadra: false, estado: "solo_contable" },
    ]);
  });

  it("solo_inventario: valor en archivos sin saldo contable", () => {
    const consolidado: ClasificadorCruce[] = [{ clasificador: "PT", total: 300, cuentas4: ["1430"] }];
    const r = construirCruceContable({ contablePorCuenta: {}, consolidado, nombrePorCuenta });
    expect(r.filas).toEqual([
      { cuenta4: "1430", nombre: "Materias primas", contable: 0, inventario: 300, noModular: 0, diferenciaBruta: -300, diferencia: -300, cuadra: false, estado: "solo_inventario" },
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
    expect(r.totales).toEqual({ contable: 1250, inventario: 1300, noModular: 0, diferenciaBruta: -50, diferencia: -50 });
    expect(r.sinCuenta).toEqual([{ clasificador: "SIN-CTA", total: 250 }]);
    expect(r.multiAsignado).toEqual([{ clasificador: "AMBIGUO", total: 700, cuentas4: ["1430", "1435"] }]);
  });

  // Cuentas NO MODULARES: parte del saldo contable de una fila corresponde a cuentas del
  // cliente que no hacen parte de la conciliación del módulo. Se descuentan del lado
  // contable; `diferenciaBruta` conserva la cifra sin descontar.
  it("sin exclusiones el cruce es idéntico al de siempre: noModular 0 y bruta = ajustada", () => {
    const r = construirCruceContable({
      contablePorCuenta: { "1435": 500 },
      consolidado: [{ clasificador: "NO FABRICADAS", total: 300, cuentas4: ["1435"] }],
      nombrePorCuenta,
    });
    expect(r.filas[0]).toMatchObject({ noModular: 0, diferenciaBruta: 200, diferencia: 200, cuadra: false });
    expect(r.totales).toMatchObject({ noModular: 0, diferenciaBruta: 200, diferencia: 200 });
  });

  it("descuenta lo no modular de la diferencia y conserva la bruta", () => {
    const r = construirCruceContable({
      contablePorCuenta: { "1435": 500 },
      noModularPorCuenta: { "1435": 150 },
      consolidado: [{ clasificador: "NO FABRICADAS", total: 300, cuentas4: ["1435"] }],
      nombrePorCuenta,
    });
    expect(r.filas[0]).toMatchObject({ contable: 500, inventario: 300, noModular: 150, diferenciaBruta: 200, diferencia: 50 });
  });

  it("una exclusión que explica toda la diferencia deja la fila cuadrada", () => {
    const r = construirCruceContable({
      contablePorCuenta: { "1465": 15_050_333 },
      noModularPorCuenta: { "1465": 14_107_833 },
      consolidado: [{ clasificador: "EN TRÁNSITO", total: 942_500, cuentas4: ["1465"] }],
      nombrePorCuenta,
    });
    expect(r.filas[0]).toMatchObject({ diferenciaBruta: 14_107_833, diferencia: 0, cuadra: true });
  });

  it("el estado sigue la PRESENCIA de saldo, no la diferencia ajustada", () => {
    // Todo el saldo contable es no modular y no hay archivos: cuadra, pero sigue siendo
    // una cuenta sin contraparte en el módulo y así debe verse.
    const r = construirCruceContable({
      contablePorCuenta: { "1499": 800 },
      noModularPorCuenta: { "1499": 800 },
      consolidado: [],
      nombrePorCuenta,
    });
    expect(r.filas[0]).toMatchObject({ estado: "solo_contable", cuadra: true, diferencia: 0, diferenciaBruta: 800 });
  });

  it("los totales suman lo no modular y la bruta por separado", () => {
    const r = construirCruceContable({
      contablePorCuenta: { "1435": 500, "1465": 300 },
      noModularPorCuenta: { "1435": 100, "1465": 300 },
      consolidado: [{ clasificador: "NO FABRICADAS", total: 200, cuentas4: ["1435"] }],
      nombrePorCuenta,
    });
    expect(r.totales).toMatchObject({ contable: 800, inventario: 200, noModular: 400, diferenciaBruta: 600, diferencia: 200 });
  });

  it("ordena las filas por cuenta4", () => {
    const consolidado: ClasificadorCruce[] = [{ clasificador: "A", total: 1, cuentas4: ["1499"] }];
    const r = construirCruceContable({ contablePorCuenta: { "1430": 1 }, consolidado, nombrePorCuenta });
    expect(r.filas.map((f) => f.cuenta4)).toEqual(["1430", "1499"]);
  });
});
