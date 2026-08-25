import { describe, it, expect } from "vitest";
import { construirCruceTercero, type AporteTercero } from "./cruce-tercero";

describe("construirCruceTercero", () => {
  it("cuadre exacto", () => {
    const contablePorNit: AporteTercero[] = [{ nit: "900123456", nombre: "ACME S.A.", saldo: 1000 }];
    const moduloPorNit: AporteTercero[] = [{ nit: "900123456", nombre: "ACME S.A.", saldo: 1000 }];
    const r = construirCruceTercero({ contablePorNit, moduloPorNit });
    expect(r.filas).toEqual([
      { nit: "900123456", nombre: "ACME S.A.", contable: 1000, modulo: 1000, diferencia: 0, cuadra: true, estado: "cuadra" },
    ]);
  });

  it("descuadre por encima de la tolerancia", () => {
    const r = construirCruceTercero({
      contablePorNit: [{ nit: "900123456", nombre: "ACME", saldo: 1000 }],
      moduloPorNit: [{ nit: "900123456", nombre: "ACME", saldo: 900 }],
    });
    expect(r.filas[0].estado).toBe("descuadre");
    expect(r.filas[0].diferencia).toBe(100);
    expect(r.filas[0].cuadra).toBe(false);
  });

  it("solo_contable: saldo contable sin auxiliar en el módulo", () => {
    const r = construirCruceTercero({
      contablePorNit: [{ nit: "900123456", nombre: "ACME", saldo: 500 }],
      moduloPorNit: [],
    });
    expect(r.filas).toEqual([
      { nit: "900123456", nombre: "ACME", contable: 500, modulo: 0, diferencia: 500, cuadra: false, estado: "solo_contable" },
    ]);
  });

  it("solo_modulo: auxiliar del módulo sin saldo contable", () => {
    const r = construirCruceTercero({
      contablePorNit: [],
      moduloPorNit: [{ nit: "800197268", nombre: "Cliente X", saldo: 300 }],
    });
    expect(r.filas).toEqual([
      { nit: "800197268", nombre: "Cliente X", contable: 0, modulo: 300, diferencia: -300, cuadra: false, estado: "solo_modulo" },
    ]);
  });

  it("tolerancia: diferencia mínima cuadra igual", () => {
    const r = construirCruceTercero(
      {
        contablePorNit: [{ nit: "900123456", nombre: "ACME", saldo: 1000 }],
        moduloPorNit: [{ nit: "900123456", nombre: "ACME", saldo: 999.995 }],
      },
      { tolerancia: 0.01 },
    );
    expect(r.filas[0].estado).toBe("cuadra");
  });

  it("totales suman las columnas de las filas", () => {
    const r = construirCruceTercero({
      contablePorNit: [
        { nit: "900123456", nombre: "ACME", saldo: 1000 },
        { nit: "800197268", nombre: "Cliente X", saldo: 250 },
      ],
      moduloPorNit: [{ nit: "900123456", nombre: "ACME", saldo: 900 }],
    });
    expect(r.totales).toEqual({ contable: 1250, modulo: 900, diferencia: 350 });
  });

  it("dos aportes con el mismo nit canónico en un mismo lado se suman", () => {
    const r = construirCruceTercero({
      contablePorNit: [
        { nit: "900123456", nombre: "ACME", saldo: 400 },
        { nit: "900123456", nombre: "ACME", saldo: 300 },
      ],
      moduloPorNit: [{ nit: "900123456", nombre: "ACME", saldo: 700 }],
    });
    expect(r.filas).toEqual([
      { nit: "900123456", nombre: "ACME", contable: 700, modulo: 700, diferencia: 0, cuadra: true, estado: "cuadra" },
    ]);
  });

  it("prefiere el nombre del lado contable cuando ambos lo traen", () => {
    const r = construirCruceTercero({
      contablePorNit: [{ nit: "900123456", nombre: "Nombre Contable", saldo: 100 }],
      moduloPorNit: [{ nit: "900123456", nombre: "Nombre Modulo", saldo: 100 }],
    });
    expect(r.filas[0].nombre).toBe("Nombre Contable");
  });

  it("usa el nombre del módulo si el lado contable no lo trae", () => {
    const r = construirCruceTercero({
      contablePorNit: [{ nit: "900123456", nombre: null, saldo: 100 }],
      moduloPorNit: [{ nit: "900123456", nombre: "Nombre Modulo", saldo: 100 }],
    });
    expect(r.filas[0].nombre).toBe("Nombre Modulo");
  });

  it("orden determinista: descuadres primero por mayor diferencia absoluta, desempate por nit", () => {
    const r = construirCruceTercero({
      contablePorNit: [
        { nit: "111111111", nombre: "A", saldo: 100 }, // descuadre pequeño
        { nit: "222222222", nombre: "B", saldo: 500 }, // descuadre grande
        { nit: "333333333", nombre: "C", saldo: 200 }, // cuadra
        { nit: "444444444", nombre: "D", saldo: 100 }, // descuadre pequeño, empate con 111111111
      ],
      moduloPorNit: [
        { nit: "111111111", nombre: "A", saldo: 50 },
        { nit: "222222222", nombre: "B", saldo: 0 },
        { nit: "333333333", nombre: "C", saldo: 200 },
        { nit: "444444444", nombre: "D", saldo: 50 },
      ],
    });
    expect(r.filas.map((f) => f.nit)).toEqual(["222222222", "111111111", "444444444", "333333333"]);
  });
});
