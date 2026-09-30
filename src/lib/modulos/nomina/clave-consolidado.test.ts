import { describe, expect, it } from "vitest";
import { claveConsolidado, partirClaveConsolidado } from "./clave-consolidado";

describe("clave del consolidado con agrupador", () => {
  it("ida y vuelta", () => {
    expect(claveConsolidado("1", "GYA")).toBe("1 ∥ GYA");
    expect(claveConsolidado("1", "")).toBe("1");
    expect(claveConsolidado("1", null)).toBe("1");
    expect(partirClaveConsolidado("1 ∥ GYA")).toEqual({ clasificador: "1", agrupador: "GYA", cuentaArchivo: null });
    expect(partirClaveConsolidado("1")).toEqual({ clasificador: "1", agrupador: "", cuentaArchivo: null });
    expect(partirClaveConsolidado("  207 ∥ 10 ")).toEqual({ clasificador: "207", agrupador: "10", cuentaArchivo: null });
  });
  it("un agrupador con espacios o guiones sobrevive", () => {
    const clave = claveConsolidado("HED", "CENTRO - PLANTA 2");
    expect(partirClaveConsolidado(clave)).toEqual({ clasificador: "HED", agrupador: "CENTRO - PLANTA 2", cuentaArchivo: null });
  });
});

describe("clave del consolidado con la cuenta del archivo", () => {
  it("la cuenta entra con « # » y se parte por la cola", () => {
    expect(claveConsolidado("1", "GYA", "51050601")).toBe("1 ∥ GYA # 51050601");
    expect(claveConsolidado("23", "", "51052703")).toBe("23 # 51052703");
    expect(partirClaveConsolidado("1 ∥ GYA # 51050601")).toEqual({ clasificador: "1", agrupador: "GYA", cuentaArchivo: "51050601" });
    expect(partirClaveConsolidado("23 # 51052703")).toEqual({ clasificador: "23", agrupador: "", cuentaArchivo: "51052703" });
  });

  it("sin cuenta la clave es la de siempre", () => {
    expect(claveConsolidado("1", "GYA", null)).toBe("1 ∥ GYA");
    expect(claveConsolidado("1", "GYA", "")).toBe("1 ∥ GYA");
  });

  it("un centro con «#» en el nombre no se confunde con la cuenta", () => {
    expect(partirClaveConsolidado(claveConsolidado("HED", "PLANTA #2"))).toEqual({ clasificador: "HED", agrupador: "PLANTA #2", cuentaArchivo: null });
    expect(partirClaveConsolidado(claveConsolidado("HED", "PLANTA # 2", "72050601"))).toEqual({ clasificador: "HED", agrupador: "PLANTA # 2", cuentaArchivo: "72050601" });
    // Un número corto al final del centro no es una cuenta.
    expect(partirClaveConsolidado("HED ∥ SEDE # 12").cuentaArchivo).toBeNull();
  });
});
