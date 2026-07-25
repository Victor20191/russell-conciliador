import { describe, expect, it } from "vitest";
import {
  esDescuadreAccionable,
  esDescuadreInformativo,
  esSaldoContrarioAccionable,
  esSaldoContrarioInformativo,
  esClaveUmbral,
  esMagnitudAccionable,
  esMagnitudInformativo,
  getUmbralDef,
  UMBRALES_ALERTAS_DEFECTO,
  UMBRALES_CATALOGO,
  type UmbralesAlertas,
} from "./umbrales-alertas";

const FABRICA = UMBRALES_ALERTAS_DEFECTO;

describe("umbrales de alertas contables", () => {
  it("trata descuadres menores de $2.000 como informativos y $2.000 como alerta", () => {
    expect(esDescuadreInformativo(1_999, FABRICA)).toBe(true);
    expect(esDescuadreAccionable(-1_999, FABRICA)).toBe(false);
    expect(esDescuadreInformativo(2_000, FABRICA)).toBe(false);
    expect(esDescuadreAccionable(-2_000, FABRICA)).toBe(true);
  });

  it("solo alerta naturaleza contraria cuando supera $50.000", () => {
    expect(esSaldoContrarioInformativo(50_000, false, FABRICA)).toBe(true);
    expect(esSaldoContrarioAccionable(-50_000, false, FABRICA)).toBe(false);
    expect(esSaldoContrarioInformativo(50_001, false, FABRICA)).toBe(false);
    expect(esSaldoContrarioAccionable(-50_001, false, FABRICA)).toBe(true);
    expect(esSaldoContrarioAccionable(90_000, true, FABRICA)).toBe(false);
  });
});

describe("umbrales parametrizados desde /config/parametros", () => {
  // Los mismos montos cambian de veredicto al mover el umbral: es la garantía de
  // que la parametrización manda y no queda ningún valor de fábrica cableado.
  const SUBIDOS: UmbralesAlertas = { descuadre: 100_000, naturaleza: 1_000_000 };
  const EN_CERO: UmbralesAlertas = { descuadre: 0, naturaleza: 0 };

  it("subir el umbral degrada a informativas alertas que antes eran accionables", () => {
    expect(esDescuadreAccionable(50_000, FABRICA)).toBe(true);
    expect(esDescuadreAccionable(50_000, SUBIDOS)).toBe(false);
    expect(esDescuadreInformativo(50_000, SUBIDOS)).toBe(true);

    expect(esSaldoContrarioAccionable(-500_000, false, FABRICA)).toBe(true);
    expect(esSaldoContrarioAccionable(-500_000, false, SUBIDOS)).toBe(false);
    expect(esSaldoContrarioInformativo(-500_000, false, SUBIDOS)).toBe(true);
  });

  it("con el umbral en cero toda diferencia real es accionable y ninguna informativa", () => {
    expect(esDescuadreAccionable(1, EN_CERO)).toBe(true);
    expect(esDescuadreInformativo(1, EN_CERO)).toBe(false);
    // Una diferencia de cero nunca alerta, sin importar el umbral.
    expect(esDescuadreInformativo(0, EN_CERO)).toBe(false);
    expect(esSaldoContrarioAccionable(-1, false, EN_CERO)).toBe(true);
    // Un saldo que SÍ concuerda con su naturaleza jamás alerta.
    expect(esSaldoContrarioAccionable(-1, true, EN_CERO)).toBe(false);
  });
});

describe("catálogo de umbrales", () => {
  it("expone las dos claves conocidas con sus valores de fábrica", () => {
    expect(UMBRALES_CATALOGO.map((u) => u.clave)).toEqual(["descuadre", "naturaleza"]);
    expect(getUmbralDef("descuadre")?.defecto).toBe(2_000);
    expect(getUmbralDef("naturaleza")?.defecto).toBe(50_000);
  });

  it("rechaza claves desconocidas (la Server Action no debe escribirlas)", () => {
    expect(esClaveUmbral("descuadre")).toBe(true);
    expect(esClaveUmbral("inventada")).toBe(false);
    expect(getUmbralDef("inventada")).toBeUndefined();
  });

  it("los valores de fábrica del catálogo y del objeto por defecto coinciden", () => {
    for (const def of UMBRALES_CATALOGO) {
      expect(UMBRALES_ALERTAS_DEFECTO[def.clave]).toBe(def.defecto);
    }
  });

  it("magnitud: solo un valor NEGATIVO (signo contrario) alerta; positivo o cero, no", () => {
    // Positivo (dominante) o cero → nunca es alerta de magnitud.
    expect(esMagnitudAccionable(1_000_000)).toBe(false);
    expect(esMagnitudInformativo(1_000_000)).toBe(false);
    expect(esMagnitudAccionable(0)).toBe(false);
    expect(esMagnitudAccionable(null)).toBe(false);
    // Negativo (contrario): informativo bajo $50.000, accionable desde $50.000.
    expect(esMagnitudInformativo(-49_999)).toBe(true);
    expect(esMagnitudAccionable(-49_999)).toBe(false);
    expect(esMagnitudInformativo(-50_000)).toBe(false);
    expect(esMagnitudAccionable(-50_000)).toBe(true);
  });
});
