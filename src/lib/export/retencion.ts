// Exportación a Excel de una revisión de Retención en la fuente (puro, sin BD): las vistas «Por
// meses» y «Acumulado» y la lista de formularios cargados. La marca la aplica `escribirLibroMarca`.

import ExcelJS from "exceljs";
import type { VistaRevision } from "@/lib/impuestos/retencion/vistas";
import { EXCEL, escribirLibroMarca, estiloEncabezado, rellenoMarca } from "./marca-excel";

const PESOS = "#,##0";

export type MetaRevisionExcel = {
  cliente: string;
  nit: string;
  anio: number;
  corte: string;
  periodicidad: string;
};

export type FormularioExcel = {
  periodo: string;
  formulario: string;
  numero: string;
  estado: string;
  correccionDe: string | null;
  concepto: string | null;
  numeroPagado: string | null;
  fecha: string | null;
  autoadhesivo: string | null;
  corregidoAMano: string;
};

function encabezadoLibro(ws: ExcelJS.Worksheet, meta: MetaRevisionExcel, titulo: string): void {
  ws.addRow([`Retención en la fuente · ${titulo}`]).font = { bold: true, size: 13, color: { argb: EXCEL.titulo } };
  ws.addRow([`${meta.cliente} · NIT ${meta.nit} · ${meta.anio} · corte ${meta.corte} · periodicidad ${meta.periodicidad}`]).font = { color: { argb: EXCEL.textoSecundario } };
  ws.addRow([]);
}

function filaSeccion(ws: ExcelJS.Worksheet, texto: string, columnas: number): void {
  const fila = ws.addRow([texto]);
  fila.font = { bold: true, color: { argb: EXCEL.titulo } };
  for (let c = 1; c <= columnas; c++) fila.getCell(c).fill = rellenoMarca(EXCEL.nivel2);
}

/** Agrupa en tramos seguidos de la misma sección (el orden del formulario). */
function tramos<T extends { seccion: string }>(filas: readonly T[]): { seccion: string; filas: T[] }[] {
  return filas.reduce<{ seccion: string; filas: T[] }[]>((g, f) => {
    const ultimo = g[g.length - 1];
    if (ultimo && ultimo.seccion === f.seccion) ultimo.filas.push(f);
    else g.push({ seccion: f.seccion, filas: [f] });
    return g;
  }, []);
}

function hojaPorMeses(wb: ExcelJS.Workbook, meta: MetaRevisionExcel, vista: VistaRevision): void {
  const ws = wb.addWorksheet("Por meses");
  encabezadoLibro(ws, meta, "por meses");
  const columnas = 2 + vista.meses.length * 2 + 1;
  const e1 = ws.addRow(["Concepto", "Renglón", ...vista.meses.flatMap((m) => [`${m.etiqueta}${m.formulario ? ` · ${m.formulario.numero}${m.formulario.esCorreccion ? " (corrección)" : ""}` : m.causal ? " · sin formulario" : " · falta el 350"}`, ""]), "Total"]);
  const e2 = ws.addRow(["", "", ...vista.meses.flatMap(() => ["P. jurídica", "P. natural"]), ""]);
  estiloEncabezado(e1);
  estiloEncabezado(e2, EXCEL.encabezadoSecundario);
  vista.meses.forEach((_, i) => ws.mergeCells(e1.number, 3 + i * 2, e1.number, 4 + i * 2));
  for (const t of tramos(vista.filas)) {
    filaSeccion(ws, t.seccion, columnas);
    for (const f of t.filas) {
      const valores = f.tipo === "concepto" ? f.meses.flatMap((m) => [m.pj, m.pn]) : f.meses.flatMap((m) => [m.valor, null]);
      const renglon = f.tipo === "concepto" ? [f.renglonPj, f.renglonPn].map((r) => r ?? "—").join(" · ") : String(f.renglonPj);
      const fila = ws.addRow([f.etiqueta, renglon, ...valores, f.total]);
      if (f.tipo !== "concepto") vista.meses.forEach((_, i) => ws.mergeCells(fila.number, 3 + i * 2, fila.number, 4 + i * 2));
      if (f.tipo === "total") fila.font = { bold: true };
    }
  }
  filaSeccion(ws, "Pagos · formulario 490", columnas);
  for (const p of vista.pagos) {
    const fila = ws.addRow([p.etiqueta, "", ...p.meses.flatMap((v) => [v, null]), p.total]);
    vista.meses.forEach((_, i) => ws.mergeCells(fila.number, 3 + i * 2, fila.number, 4 + i * 2));
    if (p.clave === "total_pagado") fila.font = { bold: true };
  }
  ws.getColumn(1).width = 58;
  ws.getColumn(2).width = 11;
  for (let c = 3; c <= columnas; c++) {
    ws.getColumn(c).width = 15;
    ws.getColumn(c).numFmt = PESOS;
  }
  ws.views = [{ state: "frozen", xSplit: 2, ySplit: e2.number }];
}

function hojaAcumulado(wb: ExcelJS.Workbook, meta: MetaRevisionExcel, vista: VistaRevision): void {
  const ws = wb.addWorksheet("Acumulado");
  encabezadoLibro(ws, meta, "acumulado");
  const conFormulario = vista.meses.filter((m) => m.formulario).length;
  ws.addRow([`Suma de ${conFormulario} de ${vista.meses.length} meses con 350 hasta el corte.`]).font = { color: { argb: EXCEL.textoSecundario } };
  estiloEncabezado(ws.addRow(["Concepto", "Renglón P. jurídica", "Renglón P. natural", "Total"]));
  for (const t of tramos(vista.filas)) {
    filaSeccion(ws, t.seccion, 4);
    for (const f of t.filas) {
      const fila = ws.addRow(f.tipo === "concepto" ? [f.etiqueta, f.renglonPj ?? "—", f.renglonPn ?? "—", f.total] : [f.etiqueta, f.renglonPj, "", f.total]);
      if (f.tipo === "total") fila.font = { bold: true };
    }
  }
  filaSeccion(ws, "Pagos · formulario 490", 4);
  for (const p of vista.pagos) {
    const fila = ws.addRow([p.etiqueta, "", "", p.total]);
    if (p.clave === "total_pagado") fila.font = { bold: true };
  }
  ws.getColumn(1).width = 64;
  ws.getColumn(2).width = 18;
  ws.getColumn(3).width = 18;
  ws.getColumn(4).width = 18;
  ws.getColumn(4).numFmt = PESOS;
}

function hojaFormularios(wb: ExcelJS.Workbook, meta: MetaRevisionExcel, formularios: readonly FormularioExcel[]): void {
  const ws = wb.addWorksheet("Formularios");
  encabezadoLibro(ws, meta, "formularios cargados");
  estiloEncabezado(ws.addRow(["Período", "Formulario", "Número", "Estado", "Corrige a", "Concepto", "350 que paga", "Fecha del sello (997)", "Autoadhesivo (996)", "Corregidos a mano"]));
  for (const f of formularios) {
    ws.addRow([f.periodo, f.formulario, f.numero, f.estado, f.correccionDe ?? "", f.concepto ?? "", f.numeroPagado ?? "", f.fecha ?? "", f.autoadhesivo ?? "", f.corregidoAMano]);
  }
  [12, 11, 16, 14, 16, 10, 16, 20, 20, 20].forEach((w, i) => (ws.getColumn(i + 1).width = w));
}

export function libroRetencion(meta: MetaRevisionExcel, vista: VistaRevision, formularios: readonly FormularioExcel[]): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Russell Conciliador";
  hojaPorMeses(wb, meta, vista);
  hojaAcumulado(wb, meta, vista);
  hojaFormularios(wb, meta, formularios);
  return wb;
}

export async function excelRetencion(meta: MetaRevisionExcel, vista: VistaRevision, formularios: readonly FormularioExcel[]): Promise<Buffer> {
  return escribirLibroMarca(libroRetencion(meta, vista, formularios));
}
