import { describe, expect, it } from "vitest";
import { esFalloTransporteCarga } from "./recuperacion-red";

describe("esFalloTransporteCarga", () => {
  it.each([
    new TypeError("Failed to fetch"),
    new Error("fetch failed"),
    new Error("NetworkError when attempting to fetch resource."),
    new Error("Load failed"),
    "Network request failed",
  ])("reconoce errores recuperables de transporte", (error) => {
    expect(esFalloTransporteCarga(error)).toBe(true);
  });

  it.each([
    new Error("El cliente no existe"),
    new Error("Prisma P2002"),
    new Error("La extracción no produjo cuentas"),
    null,
  ])("no oculta errores funcionales o inesperados", (error) => {
    expect(esFalloTransporteCarga(error)).toBe(false);
  });
});
