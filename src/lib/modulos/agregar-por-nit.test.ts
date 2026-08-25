import { describe, it, expect } from "vitest";
import { agregarPorNit } from "./agregar-por-nit";

describe("agregarPorNit", () => {
  it("un ítem por NIT: pasa directo a aporte", () => {
    const r = agregarPorNit([{ nit: "900123456", nombre: "ACME S.A.", saldo: 1000 }]);
    expect(r.aportes).toEqual([{ nit: "900123456", nombre: "ACME S.A.", saldo: 1000 }]);
    expect(r.sinNit).toBeNull();
  });

  it("suma varios ítems del mismo NIT", () => {
    const r = agregarPorNit([
      { nit: "900123456", nombre: "ACME", saldo: 400 },
      { nit: "900123456", nombre: "ACME", saldo: 300 },
    ]);
    expect(r.aportes).toEqual([{ nit: "900123456", nombre: "ACME", saldo: 700 }]);
  });

  it("conserva el nombre del PRIMER ítem que lo traiga, en orden de la lista", () => {
    const r = agregarPorNit([
      { nit: "900123456", nombre: null, saldo: 100 },
      { nit: "900123456", nombre: "Nombre tardío", saldo: 100 },
    ]);
    expect(r.aportes[0].nombre).toBe("Nombre tardío");

    const r2 = agregarPorNit([
      { nit: "900123456", nombre: "Nombre temprano", saldo: 100 },
      { nit: "900123456", nombre: "Otro nombre", saldo: 100 },
    ]);
    expect(r2.aportes[0].nombre).toBe("Nombre temprano");
  });

  it("separa los ítems sin NIT en `sinNit` (total y conteo) y no los agrega", () => {
    const r = agregarPorNit([
      { nit: "900123456", nombre: "ACME", saldo: 100 },
      { nit: null, nombre: "Sin identificar", saldo: 50 },
      { nit: null, nombre: null, saldo: 30 },
    ]);
    expect(r.aportes).toEqual([{ nit: "900123456", nombre: "ACME", saldo: 100 }]);
    expect(r.sinNit).toEqual({ total: 80, filas: 2 });
  });

  it("sinNit es null cuando no hay ningún ítem sin NIT", () => {
    const r = agregarPorNit([{ nit: "900123456", nombre: "ACME", saldo: 100 }]);
    expect(r.sinNit).toBeNull();
  });

  it("lista vacía: sin aportes ni sinNit", () => {
    const r = agregarPorNit([]);
    expect(r.aportes).toEqual([]);
    expect(r.sinNit).toBeNull();
  });

  it("varios NIT distintos producen varios aportes, cada uno con su propia suma", () => {
    const r = agregarPorNit([
      { nit: "900123456", nombre: "ACME", saldo: 100 },
      { nit: "800197268", nombre: "Cliente X", saldo: 200 },
      { nit: "900123456", nombre: "ACME", saldo: 50 },
    ]);
    expect(r.aportes.sort((a, b) => a.nit.localeCompare(b.nit))).toEqual([
      { nit: "800197268", nombre: "Cliente X", saldo: 200 },
      { nit: "900123456", nombre: "ACME", saldo: 150 },
    ]);
  });
});
