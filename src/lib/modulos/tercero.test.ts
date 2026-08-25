import { describe, it, expect } from "vitest";
import { normalizarTerceroModulo } from "./tercero";

describe("normalizarTerceroModulo", () => {
  it("NIT con puntos y DV seguido del nombre", () => {
    expect(normalizarTerceroModulo("900.123.456-7 ACME S.A.")).toEqual({
      nitCanonico: "900123456",
      nombre: "ACME S.A.",
    });
  });

  it("solo nombre, sin ningún NIT", () => {
    expect(normalizarTerceroModulo("ACME S.A.")).toEqual({ nitCanonico: null, nombre: "ACME S.A." });
  });

  it("solo NIT, sin nombre", () => {
    expect(normalizarTerceroModulo("900123456")).toEqual({ nitCanonico: "900123456", nombre: null });
  });

  it("label NIT: con guiones y nombre tras un separador", () => {
    expect(normalizarTerceroModulo("NIT: 800.197.268-4 - Cliente X")).toEqual({
      nitCanonico: "800197268",
      nombre: "Cliente X",
    });
  });

  it("mismo NIT con y sin dígito de verificación colapsa al mismo nitCanonico", () => {
    const a = normalizarTerceroModulo("900123456");
    const b = normalizarTerceroModulo("900123456-7");
    const c = normalizarTerceroModulo("9001234567");
    expect(a.nitCanonico).toBe("900123456");
    expect(b.nitCanonico).toBe("900123456");
    expect(c.nitCanonico).toBe("900123456");
  });

  it("cédula corta (8 dígitos) se acepta como NIT plausible", () => {
    expect(normalizarTerceroModulo("12345678")).toEqual({ nitCanonico: "12345678", nombre: null });
  });

  it("token numérico de menos de 5 dígitos no se extrae como NIT", () => {
    expect(normalizarTerceroModulo("1234")).toEqual({ nitCanonico: null, nombre: "1234" });
  });

  it("entrada vacía", () => {
    expect(normalizarTerceroModulo("")).toEqual({ nitCanonico: null, nombre: null });
  });

  it("entrada null / undefined", () => {
    expect(normalizarTerceroModulo(null)).toEqual({ nitCanonico: null, nombre: null });
    expect(normalizarTerceroModulo(undefined)).toEqual({ nitCanonico: null, nombre: null });
  });

  it("acepta number", () => {
    expect(normalizarTerceroModulo(900123456)).toEqual({ nitCanonico: "900123456", nombre: null });
  });

  it("solo espacios en blanco", () => {
    expect(normalizarTerceroModulo("   ")).toEqual({ nitCanonico: null, nombre: null });
  });
});
