import { describe, expect, it } from "vitest";
import { numeroDeVersion, siguienteVersionCargue } from "./version-cargue";

describe("siguienteVersionCargue", () => {
  it("arranca en v1 sin cargues previos", () => {
    expect(siguienteVersionCargue([])).toBe("v1");
  });

  it("es correlativa cuando no hay huecos", () => {
    expect(siguienteVersionCargue(["v1", "v2"])).toBe("v3");
  });

  it("no recicla números tras eliminar una versión (solo queda v2 → v3)", () => {
    expect(siguienteVersionCargue(["v2"])).toBe("v3");
    expect(siguienteVersionCargue(["v1", "v3"])).toBe("v4");
  });

  it("ignora etiquetas que no siguen el patrón y mayúsculas", () => {
    expect(siguienteVersionCargue(["V2", "borrador", null, undefined])).toBe("v3");
  });
});

describe("numeroDeVersion", () => {
  it("extrae el número o devuelve 0", () => {
    expect(numeroDeVersion("v12")).toBe(12);
    expect(numeroDeVersion(" v3 ")).toBe(3);
    expect(numeroDeVersion("x")).toBe(0);
    expect(numeroDeVersion(null)).toBe(0);
  });
});
