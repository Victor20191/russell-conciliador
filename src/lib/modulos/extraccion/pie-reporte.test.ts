import { describe, expect, it } from "vitest";
import { esPieDeReporte } from "./pie-reporte";

describe("esPieDeReporte", () => {
  it("reconoce el pie del ERP con su paginación", () => {
    expect(esPieDeReporte(["Siesa Enterprise Net 1.25.0", null, "Pág.", 1, "/", 1])).toBe(true); // CxP Aceros Mapa
    expect(esPieDeReporte(["SBS 1.25.0", 1, "/", 1])).toBe(true); // CxP Mineralin
    expect(esPieDeReporte([null, null, "Siesa Enterprise Net 1.25.0", null])).toBe(true); // Cartera Zarzal
    expect(esPieDeReporte(["Siesa Enterprise Net 1.24.0", "Página", 3, "de", 12])).toBe(true);
  });

  it("no confunde un tercero ni una fila con importes", () => {
    expect(esPieDeReporte(["900123456", "SOLUCIONES 3.0.1 SAS", 1_500_000])).toBe(false);
    expect(esPieDeReporte(["Siesa Enterprise Net 1.25.0", 45_919_189_109.59])).toBe(false);
    expect(esPieDeReporte(["Total", 0, 1500])).toBe(false);
    expect(esPieDeReporte([null, ""])).toBe(false);
  });
});
