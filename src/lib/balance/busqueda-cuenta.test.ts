import { describe, expect, it } from "vitest";
import { codigoEmpiezaPor, coincideBusquedaCuenta } from "./busqueda-cuenta";

describe("búsqueda de cuentas", () => {
  it("solo acepta códigos que comienzan por el texto buscado", () => {
    expect(codigoEmpiezaPor("110505", "11")).toBe(true);
    expect(codigoEmpiezaPor("211005", "11")).toBe(false);
  });

  it("mantiene la coincidencia parcial por nombre", () => {
    expect(coincideBusquedaCuenta(["211005"], "Caja general Bogotá", "caja")).toBe(true);
    expect(coincideBusquedaCuenta(["211005"], "Caja general Bogotá", "bogota")).toBe(true);
  });

  it("aplica el prefijo a todos los códigos alternativos", () => {
    expect(coincideBusquedaCuenta(["11050501", "110505"], "Caja", "1105")).toBe(true);
    expect(coincideBusquedaCuenta(["21100501", "211005"], "Proveedor", "11")).toBe(false);
  });
});
