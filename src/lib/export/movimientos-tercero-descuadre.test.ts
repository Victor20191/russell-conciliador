import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { crearExcelDescuadreMovimientos } from "./movimientos-tercero-descuadre";

describe("crearExcelDescuadreMovimientos", () => {
  it("una fila por cuenta descuadrada y una hoja aparte con las cuentas que no están en el balance", async () => {
    const buffer = await crearExcelDescuadreMovimientos({
      cliente: "MUMA S.A.S", periodoBalance: "Enero 2026 – Septiembre 2026", versionBalance: "v1",
      archivo: "Cuentas enero septiembre.XLSX", generadoEn: "23/11/2026 4:30 p. m.",
      base: "saldo final del balance al 31/12/2025", conDebitosCreditos: false,
      descuadres: [{
        cuenta8: "2408010000", nombreCuenta: "IMPTO SOBRE LAS VTAS X PAGAR GENERADO",
        movimientoBalance: 567_423_794, movimientoArchivo: 77_266_712_229, diferencia: -76_699_288_435,
        debitosBalance: 1, debitosArchivo: 2, creditosBalance: 3, creditosArchivo: 4,
      }],
      sinCuentaEnBalance: [{ cuenta: "2408990000", movimiento: -50_000 }],
    });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as unknown as ArrayBuffer);
    const hoja = wb.getWorksheet("Descuadre")!;
    expect(hoja.getRow(6).getCell(5).value).toBe("Diferencia");
    expect(hoja.getRow(7).values).toEqual(expect.arrayContaining(["2408010000", 567_423_794, 77_266_712_229, -76_699_288_435]));
    expect(wb.getWorksheet("Sin cuenta en el balance")!.getRow(2).getCell(1).value).toBe("2408990000");
    // Contra el cierre de diciembre no van los débitos y créditos del balance (son solo del mes).
    expect(hoja.getRow(6).values).not.toContain("Débitos del balance");
    expect(hoja.getRow(4).getCell(1).value).toContain("31/12/2025");
  });
});
