import { describe, expect, it } from "vitest";
import { normalizarValorErpExcel } from "./erps-clientes-workbook";

describe("importación de ERP por proceso", () => {
  it("interpreta vacíos y variantes de N/A como pendientes", () => {
    expect(normalizarValorErpExcel("")).toBeNull();
    expect(normalizarValorErpExcel("N/A")).toBeNull();
    expect(normalizarValorErpExcel("N/A.")).toBeNull();
    expect(normalizarValorErpExcel(" n. a. ")).toBeNull();
  });

  it("conserva el nombre real del ERP", () => {
    expect(normalizarValorErpExcel("  Loggro ")).toBe("Loggro");
  });
});
