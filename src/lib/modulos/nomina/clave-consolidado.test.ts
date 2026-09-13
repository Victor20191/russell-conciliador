import { describe, expect, it } from "vitest";
import { claveConsolidado, partirClaveConsolidado } from "./clave-consolidado";

describe("clave del consolidado con agrupador", () => {
  it("ida y vuelta", () => {
    expect(claveConsolidado("1", "GYA")).toBe("1 ∥ GYA");
    expect(claveConsolidado("1", "")).toBe("1");
    expect(claveConsolidado("1", null)).toBe("1");
    expect(partirClaveConsolidado("1 ∥ GYA")).toEqual({ clasificador: "1", agrupador: "GYA" });
    expect(partirClaveConsolidado("1")).toEqual({ clasificador: "1", agrupador: "" });
    expect(partirClaveConsolidado("  207 ∥ 10 ")).toEqual({ clasificador: "207", agrupador: "10" });
  });
  it("un agrupador con espacios o guiones sobrevive", () => {
    const clave = claveConsolidado("HED", "CENTRO - PLANTA 2");
    expect(partirClaveConsolidado(clave)).toEqual({ clasificador: "HED", agrupador: "CENTRO - PLANTA 2" });
  });
});
