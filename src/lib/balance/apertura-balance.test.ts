import { describe, it, expect } from "vitest";
import {
  APERTURAS_BALANCE,
  APERTURA_SIN_DECLARAR,
  aperturaSugerida,
  compararApertura,
  etiquetaApertura,
  parsearApertura,
} from "./apertura-balance";

describe("parsearApertura", () => {
  it("acepta los dos valores canónicos sin importar mayúsculas ni espacios", () => {
    expect(parsearApertura("cuenta")).toBe("cuenta");
    expect(parsearApertura("tercero")).toBe("tercero");
    expect(parsearApertura(" Tercero ")).toBe("tercero");
    expect(parsearApertura("CUENTA")).toBe("cuenta");
  });

  it("es fail-closed con cualquier otra entrada", () => {
    // Un valor no reconocido NO puede degradarse a «por cuenta»: la carga debe
    // exigir que el usuario lo declare.
    expect(parsearApertura("terceros")).toBeNull();
    expect(parsearApertura("")).toBeNull();
    expect(parsearApertura(null)).toBeNull();
    expect(parsearApertura(undefined)).toBeNull();
    expect(parsearApertura(1)).toBeNull();
    expect(parsearApertura({ valor: "cuenta" })).toBeNull();
  });
});

describe("etiquetaApertura", () => {
  it("traduce a la etiqueta de pantalla", () => {
    expect(etiquetaApertura("cuenta")).toBe("Por cuenta");
    expect(etiquetaApertura("tercero")).toBe("Por terceros");
  });

  it("los cargues antiguos (sin dato) muestran «—»", () => {
    expect(etiquetaApertura(null)).toBe(APERTURA_SIN_DECLARAR);
    expect(etiquetaApertura("otra cosa")).toBe(APERTURA_SIN_DECLARAR);
  });

  it("cubre todas las opciones del catálogo", () => {
    for (const opcion of APERTURAS_BALANCE) {
      expect(etiquetaApertura(opcion.valor)).toBe(opcion.etiqueta);
    }
  });
});

describe("aperturaSugerida", () => {
  it("propone lo que detectó la lectura del archivo", () => {
    expect(aperturaSugerida(true)).toBe("tercero");
    expect(aperturaSugerida(false)).toBe("cuenta");
  });
});

describe("compararApertura", () => {
  it("ordena alfabéticamente y deja los cargues sin dato al final", () => {
    const filas = ["tercero", null, "cuenta"];
    expect([...filas].sort(compararApertura)).toEqual(["cuenta", "tercero", null]);
  });

  it("es estable entre valores iguales", () => {
    expect(compararApertura("cuenta", "cuenta")).toBe(0);
    expect(compararApertura(null, null)).toBe(0);
  });
});
