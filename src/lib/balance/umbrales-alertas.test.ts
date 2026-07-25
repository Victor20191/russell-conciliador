import { describe, expect, it } from "vitest";
import {
  esDescuadreAccionable,
  esDescuadreInformativo,
  esSaldoContrarioAccionable,
  esSaldoContrarioInformativo,
  esMagnitudAccionable,
  esMagnitudInformativo,
} from "./umbrales-alertas";

describe("umbrales de alertas contables", () => {
  it("trata descuadres menores de $2.000 como informativos y $2.000 como alerta", () => {
    expect(esDescuadreInformativo(1_999)).toBe(true);
    expect(esDescuadreAccionable(-1_999)).toBe(false);
    expect(esDescuadreInformativo(2_000)).toBe(false);
    expect(esDescuadreAccionable(-2_000)).toBe(true);
  });

  it("solo alerta naturaleza contraria cuando supera $50.000", () => {
    expect(esSaldoContrarioInformativo(50_000, false)).toBe(true);
    expect(esSaldoContrarioAccionable(-50_000, false)).toBe(false);
    expect(esSaldoContrarioInformativo(50_001, false)).toBe(false);
    expect(esSaldoContrarioAccionable(-50_001, false)).toBe(true);
    expect(esSaldoContrarioAccionable(90_000, true)).toBe(false);
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
