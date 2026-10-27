import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import JSZip from "jszip";
import { EXCEL, escribirLibroMarca, estiloEncabezado } from "./marca-excel";
import { COLORES_ADMITIDOS } from "@/lib/marca/paleta";

async function estilosDe(buf: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(buf);
  return zip.file("xl/styles.xml")!.async("string");
}

describe("hojas de cálculo con la marca", () => {
  it("todas las fuentes, también la «Normal», quedan en Arial y sin la fuente del tema", async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Hoja");
    ws.getCell("A1").value = "Título";
    ws.getCell("A1").font = { bold: true, size: 12 };
    ws.getCell("B2").value = "Código";
    ws.getCell("B2").font = { name: "Consolas" };
    const estilos = await estilosDe(await escribirLibroMarca(wb));
    expect(estilos).not.toMatch(/Calibri|Consolas|scheme val=/);
    expect([...estilos.matchAll(/<font>/g)].length).toBe([...estilos.matchAll(/<name val="Arial"\/>/g)].length);
  });

  it("todo color de relleno, borde o texto es del manual", async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Hoja");
    estiloEncabezado(ws.getCell("A1"));
    ws.getCell("A2").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEFF1F5" } }; // gris azulado ajeno
    ws.getCell("A3").font = { color: { argb: "FFB91C1C" } }; // rojo ajeno
    ws.getCell("A4").border = { top: { style: "thin", color: { argb: "FFD8E0EA" } } };
    const buf = await escribirLibroMarca(wb);
    const colores = [...(await estilosDe(buf)).matchAll(/rgb="FF([0-9A-F]{6})"/g)].map((m) => `#${m[1]}`);
    expect(colores.length).toBeGreaterThan(0);
    for (const color of colores) expect(COLORES_ADMITIDOS.has(color)).toBe(true);
    // El libro sigue abriéndose y conserva el encabezado de marca.
    const leido = new ExcelJS.Workbook();
    await leido.xlsx.load(buf as unknown as Parameters<typeof leido.xlsx.load>[0]);
    const a1 = leido.worksheets[0].getCell("A1");
    expect(a1.font?.name).toBe("Arial");
    expect((a1.fill as ExcelJS.FillPattern).fgColor?.argb).toBe(EXCEL.encabezado);
    expect(a1.font?.color?.argb).toBe(EXCEL.textoEncabezado);
  });
});
