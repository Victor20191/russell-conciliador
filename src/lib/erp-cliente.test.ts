import { describe, expect, it } from "vitest";
import { resolverValorErpProceso } from "./erp-cliente";
import { PROCESOS_ERP, procesoErpDeModulo } from "./erp-procesos";

describe("ERP por proceso", () => {
  it("expone los siete procesos funcionales en el orden acordado", () => {
    expect(PROCESOS_ERP.map((proceso) => proceso.codigo)).toEqual([
      "CONT",
      "NOM",
      "INV",
      "ING",
      "CAR",
      "CXP",
      "AFI",
    ]);
  });

  it("usa el ERP legado únicamente cuando no existe una asignación", () => {
    expect(resolverValorErpProceso(undefined, 7)).toBe(7);
    expect(resolverValorErpProceso({ valor: 11 }, 7)).toBe(11);
  });

  it("respeta un proceso explícitamente pendiente y no hereda el ERP contable", () => {
    expect(resolverValorErpProceso({ valor: null }, 7)).toBeNull();
  });

  it("reconoce los códigos de módulos como procesos, pero no CONT", () => {
    expect(procesoErpDeModulo("ing")).toBe("ING");
    expect(procesoErpDeModulo("CONT")).toBeNull();
    expect(procesoErpDeModulo("otro")).toBeNull();
  });
});
