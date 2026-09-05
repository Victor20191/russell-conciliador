import { describe, expect, it } from "vitest";
import { coincideBusquedaPuc, normalizarBusqueda, type CuentaBuscable } from "./busqueda-puc";

const nombres = new Map([
  ["151605", "Construcciones y edificaciones"],
  ["152005", "Maquinaria y equipo"],
]);
const cuenta = (code: string, name: string, cuenta6Russell: string | null = null): CuentaBuscable => ({ code, name, cuenta6Russell });

describe("normalizarBusqueda", () => {
  it("quita espacios, mayúsculas y tildes", () => {
    expect(normalizarBusqueda("  Depreciación ACUMULADA ")).toBe("depreciacion acumulada");
    expect(normalizarBusqueda("")).toBe("");
  });
});

describe("coincideBusquedaPuc", () => {
  it("con término vacío coincide todo", () => {
    expect(coincideBusquedaPuc(cuenta("110505", "CAJA"), "")).toBe(true);
  });

  it("un término numérico es PREFIJO del código: «6165» trae el subárbol, no cifras en el medio", () => {
    expect(coincideBusquedaPuc(cuenta("616560", "DEPRECIACION"), "6165")).toBe(true);
    expect(coincideBusquedaPuc(cuenta("61656010", "MAQUINARIA"), "6165")).toBe(true);
    expect(coincideBusquedaPuc(cuenta("11616510", "OTRA"), "6165")).toBe(false);
  });

  it("un término numérico también busca por prefijo de la cuenta estándar", () => {
    expect(coincideBusquedaPuc(cuenta("61656010", "MAQUINARIA", "152005"), "1520")).toBe(true);
    expect(coincideBusquedaPuc(cuenta("61656010", "MAQUINARIA", "152005"), "151605")).toBe(false);
    expect(coincideBusquedaPuc(cuenta("61656010", "MAQUINARIA", null), "1520")).toBe(false);
  });

  it("un término con letras busca en el nombre del ERP sin tildes ni mayúsculas", () => {
    expect(coincideBusquedaPuc(cuenta("616560", "DEPRECIACION EDIFICIOS"), normalizarBusqueda("depreciación"))).toBe(true);
    expect(coincideBusquedaPuc(cuenta("616560", "DEPRECIACION EDIFICIOS"), "caja")).toBe(false);
  });

  it("y en el nombre de la cuenta estándar Russell", () => {
    expect(coincideBusquedaPuc(cuenta("61656010", "MAQUINARIA", "151605"), "edificaciones", nombres)).toBe(true);
    expect(coincideBusquedaPuc(cuenta("61656010", "MAQUINARIA", "151605"), "edificaciones")).toBe(false);
    expect(coincideBusquedaPuc(cuenta("61656010", "MAQUINARIA", null), "edificaciones", nombres)).toBe(false);
  });
});
