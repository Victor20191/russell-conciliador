import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import * as XLSX from "xlsx";
import { ingerir, type GridHoja } from "@/lib/balance/extraccion/ingesta";
import { descriptorModulo, MODULOS_IMPORT } from "../descriptores";
import type { SpecModulo } from "../extraccion/esquema";
import { norm, puntajeRol } from "../extraccion/sugerir";
import type { VersionCandidata } from "./mejor-version";
import {
  anonimizarTexto,
  cortarFilasXml,
  Ficticios,
  FILAS_DATOS_MUESTRA,
  generarMuestraRecortada,
  nombreDeMuestra,
  personasDeLectura,
  PREFIJO_NOMBRE_FICTICIO,
} from "./muestra-recortada";

const ING = descriptorModulo("ING")!;
const NOM = descriptorModulo("NOM")!;
const BANNER = "INFORME DE VENTAS · EMPRESA REAL SAS · NIT 900123456";
const ENCABEZADO_ING = ["Concepto", "Documento", "Tercero", "Valor", "Teléfono"];

async function bytesDe(wb: ExcelJS.Workbook): Promise<Uint8Array> {
  return new Uint8Array(await wb.xlsx.writeBuffer());
}
async function hojaDe(bytes: Uint8Array, nombre: string): Promise<GridHoja> {
  const ing = await ingerir(bytes.slice().buffer as ArrayBuffer, nombre);
  if (ing.modo !== "tabular") throw new Error("no tabular");
  return ing.hojas[0];
}
async function libroDe(bytes: Uint8Array): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(bytes.slice().buffer as ArrayBuffer);
  return wb;
}
const version = (encabezado: string[], spec: SpecModulo): VersionCandidata => ({
  id: 1, version: 1, estado: "validada_cliente", clienteOrigenId: 5,
  hoja: spec.hoja, filaEncabezado: spec.filaEncabezado, primeraFilaDatos: spec.primeraFilaDatos, encabezado, spec,
});

/** Reporte de ventas con rótulo combinado, encabezado gris y 150 facturas. */
async function ventasXlsx(): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Ventas");
  ws.getCell("A1").value = BANNER;
  ws.getCell("A1").font = { name: "Arial", size: 14, bold: true };
  ws.mergeCells("A1:E1");
  ws.getRow(2).values = ENCABEZADO_ING;
  ws.getRow(2).eachCell((c) => {
    c.font = { name: "Arial", size: 8, bold: true };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFC0C0C0" } };
  });
  ws.getColumn(3).width = 40;
  for (let i = 0; i < 150; i++) {
    const tercero = i % 3 === 0 ? "800555111 CLIENTE UNO SAS" : i % 3 === 1 ? "830444222 CLIENTE DOS LTDA" : "JUAN PÉREZ";
    const row = ws.getRow(3 + i);
    row.values = [i < 75 ? "VENTAS NACIONALES" : "EXPORTACIONES", `FV-${100000 + i}`, tercero, 1000 + i, `30012345${String(i).padStart(2, "0")}`];
    row.getCell(4).numFmt = "#,##0.00";
  }
  return bytesDe(wb);
}
const specIng: SpecModulo = { hoja: "Ventas", filaEncabezado: 2, primeraFilaDatos: 3, columnas: { concepto: 1, documento: 2, tercero: 3, valor: 4 } };

describe("personas ficticias", () => {
  it("toma las identificaciones y los nombres que leyó el motor", () => {
    const p = personasDeLectura([
      { datos: { tercero: "800555111 CLIENTE UNO SAS" } },
      { datos: { cedula: "43590224", empleado: "ANA MARIA BETANCOURT" } },
      { datos: { nombre: "Total CLIENTE UNO SAS" } },
      { datos: { concepto: "SALARIO BASICO" } },
    ]);
    expect([...p.ids].sort()).toEqual(["43590224", "800555111"]);
    expect([...p.nombres].sort()).toEqual(["ANA MARIA BETANCOURT", "CLIENTE UNO SAS"]);
  });

  it("cambia solo la persona, con ficticios consistentes y del mismo largo", () => {
    const p = personasDeLectura([{ datos: { tercero: "800555111 CLIENTE UNO SAS" } }, { datos: { cedula: "1022093434", empleado: "GALLO LEZCANO DANIEL" } }]);
    const f = new Ficticios();
    expect(anonimizarTexto("800555111 CLIENTE UNO SAS", p, f)).toBe("111111001 PERSONA DUMMY 001");
    expect(anonimizarTexto("Total Cliente Uno SAS", p, f)).toBe("Total PERSONA DUMMY 001");
    expect(anonimizarTexto("CC 1022093434-1", p, f)).toBe("CC 1111111002-1");
    expect(anonimizarTexto("Gallo  Lezcano Daniel", p, f)).toBe("PERSONA DUMMY 002");
    expect(anonimizarTexto("SALARIO BASICO 1022", p, f)).toBe("SALARIO BASICO 1022");
    expect(anonimizarTexto("800555111", p, f)).toBe("111111001");
  });

  it("el nombre ficticio no nombra ningún rol: si no, la fila se leería como encabezado repetido", () => {
    const ficticio = norm(new Ficticios().nombre("GALLO LEZCANO DANIEL"));
    expect(ficticio).toContain(norm(PREFIJO_NOMBRE_FICTICIO));
    const nombran = Object.values(MODULOS_IMPORT).flatMap((d) => d.columnas.filter((rc) => puntajeRol(ficticio, rc) > 0).map((rc) => `${d.codigo}.${rc.nombre}`));
    expect(nombran).toEqual([]);
  });

  it("corta el XML de la hoja después de la fila pedida", () => {
    const xml = '<worksheet><sheetData><row r="1"><c/></row><row r="2"/><row r="5"><c/></row></sheetData><mergeCells/></worksheet>';
    expect(cortarFilasXml(xml, 2)).toBe('<worksheet><sheetData><row r="1"><c/></row><row r="2"/></sheetData><mergeCells/></worksheet>');
    expect(cortarFilasXml(xml, 0)).toBe("<worksheet><sheetData></sheetData><mergeCells/></worksheet>");
  });

  it("con las filas se van sus celdas combinadas y sus hipervínculos", () => {
    const xml =
      '<worksheet><sheetData><row r="1"/><row r="3"/></sheetData>' +
      '<mergeCells count="3"><mergeCell ref="A1:F1"/><mergeCell ref="B2:B3"/><mergeCell ref="A3:C3"/></mergeCells>' +
      '<hyperlinks><hyperlink ref="A1" r:id="rId1"/><hyperlink ref="C3" r:id="rId2"/></hyperlinks></worksheet>';
    expect(cortarFilasXml(xml, 2)).toBe(
      '<worksheet><sheetData><row r="1"/></sheetData><mergeCells count="1"><mergeCell ref="A1:F1"/></mergeCells>' +
        '<hyperlinks><hyperlink ref="A1" r:id="rId1"/></hyperlinks></worksheet>',
    );
    expect(cortarFilasXml(xml, 0)).toBe("<worksheet><sheetData></sheetData></worksheet>");
  });

  it("el nombre de la muestra es el del original; un .xls se guarda como .xlsx", () => {
    expect(nombreDeMuestra("Reporte Cartera.xlsx")).toBe("Reporte Cartera.xlsx");
    expect(nombreDeMuestra("módulo nómina GP (1).xls")).toBe("módulo nómina GP (1).xlsx");
  });
});

describe("muestra: copia del original cortada", () => {
  it(".xlsx: mismo formato, rótulo intacto, 100 filas de datos y solo las personas ficticias", async () => {
    const original = await ventasXlsx();
    const r = await generarMuestraRecortada(ING, { bytes: original, nombre: "Ventas diciembre.xlsx" }, await hojaDe(original, "Ventas diciembre.xlsx"), version(ENCABEZADO_ING, specIng));
    expect(r).toMatchObject({ ok: true, nombre: "Ventas diciembre.xlsx", filasDatos: FILAS_DATOS_MUESTRA });
    if (!r.ok) return;
    const ws = (await libroDe(r.bytes)).getWorksheet("Ventas")!;
    expect(ws.getCell("A1").value).toBe(BANNER);
    expect(ws.getCell("A1").font).toMatchObject({ name: "Arial", size: 14, bold: true });
    expect(ws.model.merges).toContain("A1:E1");
    expect(ws.getCell("C2").fill).toMatchObject({ pattern: "solid", fgColor: { argb: "FFC0C0C0" } });
    expect(ws.getColumn(3).width).toBe(40);
    expect(ws.actualRowCount).toBe(2 + FILAS_DATOS_MUESTRA);
    expect(ws.getCell("C3").value).toBe("111111001 PERSONA DUMMY 001");
    expect(ws.getCell("C6").value).toBe("111111001 PERSONA DUMMY 001");
    expect(ws.getCell("C5").value).toMatch(/^PERSONA DUMMY \d{3}$/);
    // Lo que no es una persona queda igual: documento, importe con su formato y columnas no leídas.
    expect(ws.getCell("B3").value).toBe("FV-100000");
    expect(ws.getCell("D3").value).toBe(1000);
    expect(ws.getCell("D3").numFmt).toBe("#,##0.00");
    expect(ws.getCell("E3").value).toBe("3001234500");
  });

  it("reporte por empleado (HGI): la cédula y el nombre de la fila del empleado se cambian; el rótulo y los conceptos no", async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("HgiNet");
    ws.getCell("A1").value = "GEN PROMOTORA DE PROYECTOS S.A.S";
    ws.getCell("A2").value = "NIT 890,926,050-2";
    ws.getCell("A3").value = "LIQUIDACION";
    ws.getCell("A4").value = "PERIODO 24 DE 2025  ENTRE 2025-01-01  Y 2025-12-31";
    ws.getCell("F1").value = "2026-03-06";
    ws.getRow(6).values = ["CODIGO", "DESCRIPCION", null, "DOCUMENTO", "CANTIDAD", "VALOR"];
    let fila = 7;
    const empleados = [["1022093434", "GALLO LEZCANO DANIEL ALBERTO"], ["1022099401", "FLOREZ DIAZ DUVAN ESTIVEN"], ["1037666834", "MESA ESPINAL ESTEBAN"]];
    for (const [cedula, nombre] of empleados) {
      const conceptos: [string, string, number][] = [["01", "SALARIO BASICO", 17082000], ["02", "AUXILIO DE TRANSPORTE", 2400000], ["30", "APORTE SALUD", -683280]];
      ws.getRow(fila).values = [cedula, nombre, null, null, 3430, conceptos.reduce((s, c) => s + c[2], 0)];
      ws.getRow(fila).font = { bold: true };
      fila++;
      for (const [cod, con, val] of conceptos) ws.getRow(fila++).values = [cod, con, null, null, 360, val];
    }
    const original = await bytesDe(wb);
    const spec: SpecModulo = { hoja: "HgiNet", filaEncabezado: 6, primeraFilaDatos: 7, columnas: { codigo: 1, concepto: 2, cantidad: 5, valor: 6 } };
    const hoja = await hojaDe(original, "nomina.xlsx");
    const r = await generarMuestraRecortada(NOM, { bytes: original, nombre: "nomina.xlsx" }, hoja, version(["CODIGO", "DESCRIPCION", "", "DOCUMENTO", "CANTIDAD", "VALOR"], { ...spec, filaEncabezado: hoja.filasFisicas!.indexOf(6) + 1, primeraFilaDatos: hoja.filasFisicas!.indexOf(7) + 1 }));
    expect(r).toMatchObject({ ok: true });
    if (!r.ok) return;
    const out = (await libroDe(r.bytes)).getWorksheet("HgiNet")!;
    expect(out.getCell("A1").value).toBe("GEN PROMOTORA DE PROYECTOS S.A.S");
    expect(out.getCell("A2").value).toBe("NIT 890,926,050-2");
    expect(out.getCell("A4").value).toBe("PERIODO 24 DE 2025  ENTRE 2025-01-01  Y 2025-12-31");
    expect(out.getCell("A7").value).toBe("1111111001");
    expect(out.getCell("B7").value).toBe("PERSONA DUMMY 001");
    expect(out.getCell("B8").value).toBe("SALARIO BASICO");
    expect(out.getCell("F8").value).toBe(17082000);
    expect(out.getCell("A11").value).toBe("1111111002");
  });

  it(".xls: se guarda como .xlsx con el mismo nombre, mismos valores y personas ficticias", async () => {
    const aoa: unknown[][] = [[BANNER], ENCABEZADO_ING];
    for (let i = 0; i < 30; i++) aoa.push(["VENTAS", `FV-${i}`, i % 2 ? "800555111 CLIENTE UNO SAS" : "830444222 CLIENTE DOS LTDA", 100 + i, "x"]);
    const libro = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(libro, XLSX.utils.aoa_to_sheet(aoa), "Ventas");
    const original = new Uint8Array(XLSX.write(libro, { bookType: "xls", type: "array" }) as ArrayBuffer);
    const r = await generarMuestraRecortada(ING, { bytes: original, nombre: "ventas.xls" }, await hojaDe(original, "ventas.xls"), version(ENCABEZADO_ING, specIng));
    expect(r).toMatchObject({ ok: true, nombre: "ventas.xlsx" });
    if (!r.ok) return;
    const ws = (await libroDe(r.bytes)).getWorksheet("Ventas")!;
    expect(ws.getCell("A1").value).toBe(BANNER);
    expect(ws.getCell("C3").value).toBe("111111001 PERSONA DUMMY 001");
    expect(ws.getCell("D3").value).toBe(100);
  });

  it("si el patrón no reconoce el original o las filas no sirven, no hay muestra", async () => {
    const original = await ventasXlsx();
    const hoja = await hojaDe(original, "v.xlsx");
    const otroFormato = version(["Línea", "Factura", "Cliente", "Neto", "Celular"], specIng);
    expect(await generarMuestraRecortada(ING, { bytes: original, nombre: "v.xlsx" }, hoja, otroFormato)).toMatchObject({ ok: false, motivo: expect.stringContaining("no reconoce") });
  });
});
