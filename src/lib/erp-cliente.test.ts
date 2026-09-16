import { describe, expect, it } from "vitest";
import { aplicativosDelProceso } from "./erp-cliente";
import { CODIGOS_ERP_BASE, ERP_MANUAL_CODE, PROCESOS_ERP, procesoErpDeModulo } from "./erp-procesos";

describe("aplicativos por proceso", () => {
  it("la ficha tiene cuatro campos fijos, en el orden acordado", () => {
    expect(PROCESOS_ERP.map((proceso) => proceso.codigo)).toEqual(["CONT", "NOM", "INV", "AFI"]);
    expect(CODIGOS_ERP_BASE).toEqual(["CONT", "NOM", "INV", "AFI"]);
    expect(ERP_MANUAL_CODE).toBe("MANUAL");
  });

  it("Cartera, CxP e Ingresos usan los aplicativos de Contabilidad", () => {
    expect(["CAR", "cxp", "ING"].map(procesoErpDeModulo)).toEqual(["CONT", "CONT", "CONT"]);
    expect(["NOM", "INV", "AFI"].map(procesoErpDeModulo)).toEqual(["NOM", "INV", "AFI"]);
    expect(procesoErpDeModulo("otro")).toBeNull();
  });

  it("un campo puede tener varios aplicativos, sin repetir", () => {
    expect(aplicativosDelProceso(["SAP", "SIESA", "SAP"], null)).toEqual(["SAP", "SIESA"]);
  });

  it("solo usa el ERP legado cuando el consumidor de Contabilidad lo pide y el campo está vacío", () => {
    expect(aplicativosDelProceso([], 7)).toEqual([]);
    expect(aplicativosDelProceso([], 7, true)).toEqual([7]);
    expect(aplicativosDelProceso([11], 7, true)).toEqual([11]);
    expect(aplicativosDelProceso([null], null, true)).toEqual([]);
  });
});
