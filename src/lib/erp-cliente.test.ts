import { describe, expect, it } from "vitest";
import { resolverValorErpProceso } from "./erp-cliente";
import { PROCESOS_ERP, PROCESOS_ERP_BASE, procesoErpDeModulo } from "./erp-procesos";

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

  it("mantiene CONT, NOM e INV como procesos base de la ficha", () => {
    expect(PROCESOS_ERP_BASE.map((proceso) => proceso.codigo)).toEqual(["CONT", "NOM", "INV"]);
  });

  it("solo usa el ERP legado cuando el consumidor CONT lo solicita", () => {
    expect(resolverValorErpProceso(undefined, 7)).toBeNull();
    expect(resolverValorErpProceso(undefined, 7, true)).toBe(7);
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
