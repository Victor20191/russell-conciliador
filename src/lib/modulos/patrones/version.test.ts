import { describe, expect, it } from "vitest";
import { claveMuestraPatronModulo } from "../archivo-original";
import { esVersionEditable, motivoNoAprobable, siguienteVersionPatron, transicionPatronPermitida } from "./version";

describe("versiones de patrón", () => {
  it("numera con el máximo + 1 y nunca recicla un número", () => {
    expect(siguienteVersionPatron([])).toBe(1);
    expect(siguienteVersionPatron([1, 2, 4])).toBe(5);
  });

  it("aprobar exige la muestra", () => {
    expect(motivoNoAprobable({ estado: "pendiente", muestraClaveObjeto: null })).toBe("Sube el archivo de muestra antes de aprobar la versión.");
    expect(motivoNoAprobable({ estado: "pendiente", muestraClaveObjeto: "k" })).toBeNull();
    expect(motivoNoAprobable({ estado: "inactiva", muestraClaveObjeto: "k" })).toBeNull();
    expect(motivoNoAprobable({ estado: "aprobada", muestraClaveObjeto: "k" })).toBe("La versión ya está aprobada.");
  });

  it("solo permite las transiciones del ciclo de vida", () => {
    expect(transicionPatronPermitida("pendiente", "aprobada")).toBe(true);
    expect(transicionPatronPermitida("pendiente", "inactiva")).toBe(true);
    expect(transicionPatronPermitida("aprobada", "inactiva")).toBe(true);
    expect(transicionPatronPermitida("inactiva", "aprobada")).toBe(true);
    expect(transicionPatronPermitida("aprobada", "pendiente")).toBe(false);
    expect(transicionPatronPermitida("aprobada", "aprobada")).toBe(false);
    expect(esVersionEditable({ estado: "pendiente" })).toBe(true);
    expect(esVersionEditable({ estado: "aprobada" })).toBe(false);
  });

  it("la muestra cuelga del aplicativo, no de un cliente", () => {
    expect(claveMuestraPatronModulo({ moduloCodigo: "CXP", erpCode: "SIESA", version: 2, nombreArchivo: "Cxp por edades.xls" }))
      .toBe("software/modulos/cxp/patrones/siesa/v2/Cxp por edades.xls");
  });
});
