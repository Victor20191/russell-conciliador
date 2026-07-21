import { describe, expect, it } from "vitest";
import { nombreNivelCuenta } from "./nivel-cuenta";

describe("nombreNivelCuenta", () => {
  it.each([
    ["1", "Clase"],
    ["11", "Grupo"],
    ["1105", "Cuenta"],
    ["110505", "Subcuenta"],
    ["11050501", "Auxiliar"],
  ])("clasifica %s como %s", (codigo, nivel) => {
    expect(nombreNivelCuenta(codigo)).toBe(nivel);
  });

  it("cuenta solamente los dígitos cuando el código trae separadores o sufijos", () => {
    expect(nombreNivelCuenta("11-05-05-01A")).toBe("Auxiliar");
  });

  it("identifica explícitamente un nivel no canónico", () => {
    expect(nombreNivelCuenta("110")).toBe("Nivel 3");
  });
});
