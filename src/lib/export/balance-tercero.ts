// Exportación a Excel del BALANCE ABIERTO POR TERCERO — lo que se ve en
// `/balance/terceros/[id]`, en dos hojas:
//  - "Balance por tercero": el mismo árbol de la pantalla (grupo → cuenta →
//    subcuenta → auxiliar) con agrupación colapsable (outline) y, bajo cada cuenta
//    imputable, sus TERCEROS. Las agrupadoras van en NEGRILLA con el total que
//    declara el archivo; el Δ contra su desglose se anota en su propia columna.
//  - "Detalle": una fila plana por (cuenta imputable × tercero), pensada para
//    filtrar o hacer tablas dinámicas.
// Puro (sin BD): recibe el árbol ya construido por `arbol-tercero.ts`.
import ExcelJS from "exceljs";
import type { NodoArbolTercero, ResumenArbolTercero } from "@/lib/balance/arbol-tercero";
import { nombreNivelCuenta } from "@/lib/balance/nivel-cuenta";

export type MetaExportBalanceTercero = {
  cliente: string;
  nit: string | null;
  periodo: string;
  version: string;
  archivo: string | null;
  generadoEn: Date;
};

const NUM_FMT = "#,##0.00;-#,##0.00";
const INT_FMT = "#,##0";
const HEADER_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEFF1F5" } };
const N2_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFC6D0DE" } };
const N4_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFDDE3EC" } };
const N6_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF0F3F8" } };

const FILL_POR_NIVEL: Record<number, ExcelJS.Fill | undefined> = { 2: N2_FILL, 4: N4_FILL, 6: N6_FILL };

function titulo(ws: ExcelJS.Worksheet, meta: MetaExportBalanceTercero, texto: string, cols: number) {
  ws.mergeCells(1, 1, 1, cols);
  ws.getCell("A1").value = `${texto} — ${meta.cliente}${meta.nit ? ` · NIT ${meta.nit}` : ""} · ${meta.periodo} · ${meta.version}`;
  ws.getCell("A1").font = { bold: true, size: 12 };
  ws.mergeCells(2, 1, 2, cols);
  ws.getCell("A2").value = `Archivo: ${meta.archivo ?? "—"} · Generado: ${meta.generadoEn.toISOString().slice(0, 10)}`;
  ws.getCell("A2").font = { size: 9, color: { argb: "FF6B7280" } };
  ws.addRow([]);
}

function encabezados(ws: ExcelJS.Worksheet, cols: string[]) {
  const row = ws.addRow(cols);
  row.font = { bold: true };
  row.eachCell((c) => (c.fill = HEADER_FILL));
  ws.views = [{ state: "frozen", ySplit: row.number }];
}

/** Hoja 1: el árbol tal como se lee en pantalla. */
function hojaArbol(wb: ExcelJS.Workbook, arbol: readonly NodoArbolTercero[], meta: MetaExportBalanceTercero) {
  const ws = wb.addWorksheet("Balance por tercero");
  const COLS = [
    "Nivel", "Tipo", "Código", "Cuenta", "Homologada (Russell)", "NIT tercero", "Tercero",
    "Terceros", "Saldo anterior", "Débito", "Crédito", "Saldo actual", "Δ vs. desglose",
  ];
  titulo(ws, meta, "Balance por tercero", COLS.length);
  encabezados(ws, COLS);
  const MONTOS = [9, 10, 11, 12, 13];

  const pintarNodo = (n: NodoArbolTercero, outline: number) => {
    const esMov = n.tipoFila === "movimiento";
    const row = ws.addRow([
      nombreNivelCuenta(n.codigo),
      esMov ? "Movimiento" : "Agrupadora",
      n.codigo,
      n.nombre ?? "",
      esMov ? n.cuenta6Russell ?? "Sin homologar" : "",
      "",
      "",
      n.terceros,
      n.saldoInicial,
      n.debitos,
      n.creditos,
      n.saldoFinal,
      n.descuadre ?? null,
    ]);
    row.outlineLevel = outline;
    row.getCell(3).numFmt = "@";
    row.getCell(4).alignment = { indent: outline };
    row.getCell(8).numFmt = INT_FMT;
    for (const c of MONTOS) row.getCell(c).numFmt = NUM_FMT;
    const fill = FILL_POR_NIVEL[n.nivel];
    if (!esMov) {
      row.font = { bold: true };
      if (fill) row.eachCell((c) => (c.fill = fill));
    }
    if (n.descuadre != null && n.descuadre !== 0) {
      row.getCell(13).font = { bold: true, color: { argb: "FFB91C1C" } };
    }
    if (esMov && !n.cuenta6Russell) {
      row.getCell(5).font = { color: { argb: "FFB45309" } };
    }

    for (const h of n.hijos) pintarNodo(h, outline + 1);
    for (const t of n.detalleTerceros) {
      const tr = ws.addRow([
        "Tercero", "", n.codigo, "", "", t.nit ?? "Sin NIT", t.nombre ?? "",
        null, t.saldoInicial, t.debitos, t.creditos, t.saldoFinal, null,
      ]);
      tr.outlineLevel = outline + 1;
      tr.getCell(3).numFmt = "@";
      tr.getCell(6).numFmt = "@";
      tr.font = { color: { argb: "FF4B5563" } };
      for (const c of MONTOS) tr.getCell(c).numFmt = NUM_FMT;
    }
  };
  arbol.forEach((raiz) => pintarNodo(raiz, 0));

  ws.properties.outlineProperties = { summaryBelow: false, summaryRight: false };
  ws.columns = [
    { width: 12 }, { width: 12 }, { width: 14 }, { width: 44 }, { width: 20 }, { width: 16 }, { width: 40 },
    { width: 10 }, { width: 18 }, { width: 18 }, { width: 18 }, { width: 18 }, { width: 16 },
  ];
  ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4, column: COLS.length } };
}

/** Hoja 2: detalle plano (cuenta imputable × tercero). */
function hojaDetalle(wb: ExcelJS.Workbook, arbol: readonly NodoArbolTercero[], meta: MetaExportBalanceTercero) {
  const ws = wb.addWorksheet("Detalle");
  const COLS = ["Cuenta", "Nombre de la cuenta", "Homologada (Russell)", "NIT tercero", "Tercero", "Saldo anterior", "Débito", "Crédito", "Saldo actual"];
  titulo(ws, meta, "Detalle por tercero", COLS.length);
  encabezados(ws, COLS);
  const MONTOS = [6, 7, 8, 9];

  const rec = (n: NodoArbolTercero) => {
    for (const t of n.detalleTerceros) {
      const row = ws.addRow([
        n.codigo, n.nombre ?? "", n.cuenta6Russell ?? "Sin homologar", t.nit ?? "", t.nombre ?? "",
        t.saldoInicial, t.debitos, t.creditos, t.saldoFinal,
      ]);
      row.getCell(1).numFmt = "@";
      row.getCell(4).numFmt = "@";
      for (const c of MONTOS) row.getCell(c).numFmt = NUM_FMT;
    }
    n.hijos.forEach(rec);
  };
  arbol.forEach(rec);

  ws.columns = [
    { width: 14 }, { width: 40 }, { width: 20 }, { width: 16 }, { width: 40 },
    { width: 18 }, { width: 18 }, { width: 18 }, { width: 18 },
  ];
  ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4, column: COLS.length } };
}

/** Hoja 3: resumen del cargue (los números de las tarjetas). */
function hojaResumen(wb: ExcelJS.Workbook, resumen: ResumenArbolTercero, filasArchivo: number, meta: MetaExportBalanceTercero) {
  const ws = wb.addWorksheet("Resumen");
  titulo(ws, meta, "Resumen del cargue", 2);
  const filas: [string, number][] = [
    ["Filas del archivo", filasArchivo],
    ["Cuentas imputables", resumen.cuentas],
    ["Cuentas homologadas", resumen.homologadas],
    ["Cuentas sin homologar", resumen.sinHomologar],
    ["Terceros (NIT únicos)", resumen.terceros],
    ["Filas sin NIT", resumen.filasSinNit],
    ["Saldo de filas sin NIT", resumen.saldoSinNit],
    ["Agrupadoras con Δ", resumen.descuadres],
    ["Saldo anterior", resumen.saldoInicial],
    ["Débito", resumen.debitos],
    ["Crédito", resumen.creditos],
    ["Saldo actual", resumen.saldoFinal],
  ];
  for (const [k, v] of filas) {
    const row = ws.addRow([k, v]);
    row.getCell(2).numFmt = k.startsWith("Saldo") || k === "Débito" || k === "Crédito" ? NUM_FMT : INT_FMT;
  }
  ws.columns = [{ width: 28 }, { width: 22 }];
}

export async function crearExportacionBalanceTercero(input: {
  arbol: readonly NodoArbolTercero[];
  resumen: ResumenArbolTercero;
  filasArchivo: number;
  meta: MetaExportBalanceTercero;
}): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Russell LFM";
  wb.created = input.meta.generadoEn;
  hojaArbol(wb, input.arbol, input.meta);
  hojaDetalle(wb, input.arbol, input.meta);
  hojaResumen(wb, input.resumen, input.filasArchivo, input.meta);
  return Buffer.from(await wb.xlsx.writeBuffer());
}
