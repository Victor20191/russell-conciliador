import { describe, expect, it } from "vitest";
import { claveNit, nitCoincide, nucleoNit, tieneDigitosNit } from "./nit";

describe("claveNit / tieneDigitosNit", () => {
  it("deja solo los dígitos", () => {
    expect(claveNit("900.204.935-2")).toBe("9002049352");
    expect(claveNit("sin nit")).toBe("");
  });

  it("detecta si hay dígitos", () => {
    expect(tieneDigitosNit("N/A")).toBe(false);
    expect(tieneDigitosNit("830515061-1")).toBe(true);
  });
});

describe("nucleoNit", () => {
  it("recorta el dígito de verificación (9 primeros dígitos)", () => {
    expect(nucleoNit("900.204.935-2")).toBe("900204935");
    expect(nucleoNit("900204935")).toBe("900204935");
  });
});

describe("nitCoincide", () => {
  it("iguala el mismo NIT con y sin DV o con separadores", () => {
    expect(nitCoincide("900204935", "900.204.935-2")).toBe(true);
    expect(nitCoincide("NIT: 830515061-1", "830515061")).toBe(true);
  });

  it("distingue empresas diferentes", () => {
    expect(nitCoincide("900204935", "800143164")).toBe(false);
  });

  it("no da por iguales cadenas vacías o demasiado cortas", () => {
    expect(nitCoincide(null, null)).toBe(false);
    expect(nitCoincide("", "")).toBe(false);
    expect(nitCoincide("1234", "1234")).toBe(false);
  });
});
