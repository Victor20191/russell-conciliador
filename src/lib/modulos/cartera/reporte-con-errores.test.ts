import { describe, expect, it } from "vitest";
import { hayReporteConErrores, motivoReporteConErrores, reporteConErroresCartera } from "./reporte-con-errores";

const fila = (filaNum: number, datos: Record<string, unknown>, valor = 100_000) => ({ filaNum, valor, datos });

describe("reporte con errores (Cartera y CxP)", () => {
  it("el mismo documento por el mismo valor en dos terceros bloquea; en un solo tercero o por otro valor, no", () => {
    const r = reporteConErroresCartera([
      fila(2, { nit: "900000001", nombre: "PROVEEDOR A", documento: "FE-61" }, 296_310_000),
      fila(3, { nit: "900000002", nombre: "PROVEEDOR B", documento: "FE-61" }, 296_310_000),
      // Mismo número, otro valor: dos proveedores con su factura 25.
      fila(4, { nit: "900000003", nombre: "PROVEEDOR C", documento: "25" }, 10_000),
      fila(5, { nit: "900000004", nombre: "PROVEEDOR D", documento: "25" }, 20_000),
    ], "2025-12-31");
    expect(r.documentosRepetidos.cantidad).toBe(1);
    expect(r.documentosRepetidos.grupos[0]).toMatchObject({ documento: "FE-61", valor: 296_310_000 });
    expect(r.documentosRepetidos.grupos[0].terceros.map((t) => t.filas)).toEqual([[2], [3]]);
    expect(hayReporteConErrores(r)).toBe(true);
    expect(motivoReporteConErrores(r)).toContain("1 documento(s) repetido(s)");
  });

  it("la clave del tercero es la de la promoción: el mismo NIT con DV no cuenta como dos terceros", () => {
    const r = reporteConErroresCartera([
      fila(2, { nit: "900.000.001-7", nombre: "PROVEEDOR A", documento: "FE-61" }),
      fila(3, { nit: "900000001", dv: "7", nombre: "PROVEEDOR A", documento: "FE-61" }),
    ], "2025-12-31");
    expect(r.documentosRepetidos.cantidad).toBe(0);
  });

  it("un vencimiento antes de 1990 o más de 30 años después del corte bloquea", () => {
    const r = reporteConErroresCartera([
      fila(2, { nit: "900000001", documento: "FV-1", vencimiento: "1899-12-31" }),
      fila(3, { nit: "900000001", documento: "FV-2", vencimiento: "2056-01-01" }),
      fila(4, { nit: "900000001", documento: "FV-3", vencimiento: "2055-12-31" }),
      fila(5, { nit: "900000001", documento: "FV-4", vencimiento: "2026-02-15" }),
    ], "2025-12-31");
    expect(r.vencimientosImposibles.cantidad).toBe(2);
    expect(r.vencimientosImposibles.filas.map((f) => f.filaNum)).toEqual([2, 3]);
    expect(motivoReporteConErrores(r)).toContain("fila 2: 1899-12-31");
  });

  it("sin fecha de corte no se juzgan los vencimientos; sin errores no hay motivo", () => {
    const r = reporteConErroresCartera([fila(2, { nit: "900000001", documento: "FV-1", vencimiento: "1899-12-31" })], null);
    expect(r.vencimientosImposibles.cantidad).toBe(0);
    expect(hayReporteConErrores(r)).toBe(false);
    expect(motivoReporteConErrores(r)).toBeNull();
  });
});
