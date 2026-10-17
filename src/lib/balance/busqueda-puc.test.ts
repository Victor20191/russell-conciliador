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

  it("con comodín manda la posición: «**05» trae las de 0 y 5 en los dígitos 3 y 4", () => {
    expect(coincideBusquedaPuc(cuenta("110510", "CAJAS MENORES"), "**05")).toBe(true);
    expect(coincideBusquedaPuc(cuenta("11051001", "MANRIQUE"), "**05")).toBe(true);
    expect(coincideBusquedaPuc(cuenta("1105", "CAJA"), "**05")).toBe(true);
    expect(coincideBusquedaPuc(cuenta("110805", "OTRA"), "**05")).toBe(false);
    expect(coincideBusquedaPuc(cuenta("4135", "COMERCIO"), "**05")).toBe(false);
    expect(coincideBusquedaPuc(cuenta("11", "DISPONIBLE"), "**05")).toBe(false);
  });

  it("«?» vale lo mismo que «*»", () => {
    expect(coincideBusquedaPuc(cuenta("110510", "CAJAS MENORES"), "??05")).toBe(true);
    expect(coincideBusquedaPuc(cuenta("110510", "CAJAS MENORES"), "1?0510")).toBe(true);
    expect(coincideBusquedaPuc(cuenta("110510", "CAJAS MENORES"), "1?0610")).toBe(false);
  });

  it("el comodín también prueba la cuenta estándar, pero nunca los nombres", () => {
    expect(coincideBusquedaPuc(cuenta("61656010", "MAQUINARIA", "520505"), "**05")).toBe(true);
    expect(coincideBusquedaPuc(cuenta("61656010", "MAQUINARIA", null), "**05")).toBe(false);
    expect(coincideBusquedaPuc(cuenta("61656010", "**05 EN EL NOMBRE"), "**05")).toBe(false);
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
