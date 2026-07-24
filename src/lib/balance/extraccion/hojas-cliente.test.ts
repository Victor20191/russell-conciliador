import { describe, it, expect } from "vitest";
import ExcelJS from "exceljs";
import * as XLSX from "xlsx";
import { leerHojasParaPreview, columnaLetra } from "./hojas-cliente";

/** Arma un .xlsx en memoria a partir de hojas (AOA) y lo expone como un File mínimo. */
async function comoFile(hojas: Record<string, (string | number)[][]>): Promise<File> {
  const wb = new ExcelJS.Workbook();
  for (const [nombre, filas] of Object.entries(hojas)) {
    const ws = wb.addWorksheet(nombre);
    for (const fila of filas) ws.addRow(fila);
  }
  const ab = (await wb.xlsx.writeBuffer()) as ArrayBuffer;
  // Solo se usa `arrayBuffer()`; evitamos depender del `File` global del runtime.
  return { name: "balance.xlsx", arrayBuffer: async () => ab } as unknown as File;
}

function comoFileXls(hojas: Record<string, (string | number)[][]>): File {
  const wb = XLSX.utils.book_new();
  for (const [nombre, filas] of Object.entries(hojas)) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(filas), nombre);
  }
  const ab = XLSX.write(wb, { type: "array", bookType: "biff8" }) as ArrayBuffer;
  return { name: "balance.xls", arrayBuffer: async () => ab } as unknown as File;
}

describe("leerHojasParaPreview", () => {
  it("lista las hojas con contenido en orden, con su conteo y vista previa", async () => {
    const hojas = await leerHojasParaPreview(
      await comoFile({
        Balance: [["Codigo", "Cuenta", "Saldo"], ["1105", "Caja", 1000], ["1110", "Bancos", 5000]],
        Retenciones: [["Concepto", "Valor"], ["Renta", 50]],
      }),
    );
    expect(hojas.map((h) => h.nombre)).toEqual(["Balance", "Retenciones"]);
    const balance = hojas[0];
    expect(balance.totalFilas).toBe(3);
    expect(balance.totalColumnas).toBe(3);
    expect(balance.muestra[0]).toEqual(["Codigo", "Cuenta", "Saldo"]);
    expect(balance.muestra[1]).toEqual(["1105", "Caja", 1000]); // números se conservan como número
  });

  it("descarta las hojas vacías (no se ofrecen para elegir)", async () => {
    const hojas = await leerHojasParaPreview(await comoFile({ Balance: [["A"], ["1"]], Vacia: [] }));
    expect(hojas.map((h) => h.nombre)).toEqual(["Balance"]);
  });

  it("recorta la muestra a 10 filas × 8 columnas pero conserva los totales reales", async () => {
    const filas = Array.from({ length: 15 }, (_, i) => Array.from({ length: 12 }, (_, j) => `r${i}c${j}`));
    const [hoja] = await leerHojasParaPreview(await comoFile({ Datos: filas }));
    expect(hoja.totalFilas).toBe(15);
    expect(hoja.totalColumnas).toBe(12);
    expect(hoja.muestra.length).toBe(10);
    expect(hoja.muestra[0].length).toBe(8);
  });

  it("ofrece la misma selección multihoja para un Excel 97-2003 (.xls)", async () => {
    const hojas = await leerHojasParaPreview(
      comoFileXls({
        Balance: [["Código", "Cuenta", "Saldo"], ["110505", "Caja", 1000]],
        Retenciones: [["Concepto", "Valor"], ["Renta", 50]],
      }),
    );
    expect(hojas.map((hoja) => hoja.nombre)).toEqual(["Balance", "Retenciones"]);
    expect(hojas[0]).toMatchObject({
      totalFilas: 2,
      totalColumnas: 3,
      muestra: [["Código", "Cuenta", "Saldo"], ["110505", "Caja", 1000]],
    });
  });
});

describe("columnaLetra", () => {
  it("convierte índices 0-based a letras estilo Excel", () => {
    expect(columnaLetra(0)).toBe("A");
    expect(columnaLetra(25)).toBe("Z");
    expect(columnaLetra(26)).toBe("AA");
    expect(columnaLetra(27)).toBe("AB");
  });
});
