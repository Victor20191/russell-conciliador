// Exportación a Excel de una revisión de Retención en la fuente (puro, sin BD): las vistas «Por
// meses» y «Acumulado», la lista de formularios cargados, el cruce contable con todos sus terceros, el
// indicador de oportunidad y los pagos efectuados.
// La marca la aplica `escribirLibroMarca`.

import ExcelJS from "exceljs";
import type { VistaRevision } from "@/lib/impuestos/retencion/vistas";
import { alcanceSaldoInicial, etiquetaFilaCruce, renglonesFilaCruce, terceroTachado, type CruceRetencionVista, type FilaCruce } from "@/lib/impuestos/retencion/cruce";
import { ETIQUETA_OPORTUNIDAD, type FilaOportunidad } from "@/lib/impuestos/retencion/oportunidad";
import { alertaReciboDeOtro350, alertaSinRecibo, conceptosSinRecibo, ETIQUETA_PAGO, type ResultadoPagos } from "@/lib/impuestos/retencion/pagos";
import { etiquetaPeriodoRevision } from "@/lib/impuestos/retencion/periodos-revision";
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

const PESOS_CENTAVOS = "#,##0.00";
const ETIQUETA_NIVEL: Record<FilaCruce["nivel"], string> = { cero: "Cuadra", informativa: "Informativa", alerta: "Exige marca" };

function estadoMarca(f: FilaCruce): string {
  if (!f.marca) return f.requiereMarca ? "Sin marca" : "";
  return f.marca.vigente ? `Marca ${f.marca.numero}` : `Marca ${f.marca.numero} (desactualizada)`;
}

/** Hoja «Cruce contable»: el resumen por cuenta Russell, todos los terceros, lo que queda fuera y las marcas. */
function hojaCruce(wb: ExcelJS.Workbook, meta: MetaRevisionExcel, cruce: CruceRetencionVista): void {
  const ws = wb.addWorksheet("Cruce contable");
  encabezadoLibro(ws, meta, "cruce contable");
  if (cruce.balance) {
    ws.addRow([`Balance del corte: ${cruce.balance.descripcion} · del ${cruce.balance.periodoInicio} al ${cruce.balance.periodoFin}`]).font = { color: { argb: EXCEL.textoSecundario } };
  }
  if (cruce.estado !== "listo") {
    ws.addRow([cruce.mensaje]).font = { bold: true, color: { argb: EXCEL.titulo } };
    ws.getColumn(1).width = 110;
    return;
  }
  const { resultado } = cruce;
  ws.addRow([`Contabilidad = saldo final al corte, en positivo; los terceros DIAN de las cuentas que lo indican no suman. Diferencias desde ${cruce.umbral.toLocaleString("es-CO")} exigen marca.`]).font = { color: { argb: EXCEL.textoSecundario } };
  if (!cruce.inicioEnero) ws.addRow(["El balance no empieza el 1 de enero: no se mide el saldo inicial de los terceros."]).font = { color: { argb: EXCEL.textoSecundario } };
  if (resultado.saldoInicial?.restado) {
    const por = cruce.restaSaldoInicial?.por;
    ws.addRow([`Se restó el saldo inicial de ${alcanceSaldoInicial(resultado.saldoInicial)}, por ${resultado.saldoInicial.monto.toLocaleString("es-CO")}${por ? ` (${por})` : ""}: cada tercero suma solo lo del año.`]).font = { color: { argb: EXCEL.textoSecundario } };
  }
  ws.addRow([]);

  estiloEncabezado(ws.addRow(["Concepto", "Cuenta Russell", "Renglones", "Declaraciones", "Contabilidad", "Diferencia", "Estado", "Marca"]));
  for (const g of resultado.grupos) {
    filaSeccion(ws, g.etiqueta, 8);
    for (const f of g.filas) {
      ws.addRow([etiquetaFilaCruce(f), f.cuentaRussell ?? "Sin cuenta", renglonesFilaCruce(f), f.declarado, f.cuentaRussell ? f.contable : null, f.diferencia, ETIQUETA_NIVEL[f.nivel], estadoMarca(f)]);
    }
    ws.addRow([`Subtotal · ${g.etiqueta}`, "", "", g.subtotal.declarado, g.subtotal.contable, g.subtotal.diferencia]).font = { bold: true };
  }
  ws.addRow(["Total retenciones (136)", "", "", resultado.total.declarado, resultado.total.contable, resultado.total.diferencia]).font = { bold: true };

  ws.addRow([]);
  filaSeccion(ws, "Detalle contable por tercero (saldo final al corte, en positivo)", 8);
  estiloEncabezado(ws.addRow(["Cuenta Russell", "Cuenta del cliente", "Nombre de la cuenta", "NIT", "Tercero", "Saldo inicial", "Saldo final", "Observación"]));
  for (const f of resultado.grupos.flatMap((g) => g.filas)) {
    for (const c of f.cuentasCliente) {
      for (const t of c.terceros) {
        const nota = [
          t.restado ? "DIAN · se resta" : t.esDian ? "DIAN · esta cuenta no la resta" : "",
          t.saldoInicialRestado ? "Saldo inicial · se resta" : "",
          t.posibleDian ? "¿Es la DIAN? Sin NIT: no se resta sola" : "",
        ].filter(Boolean).join(". ");
        const fila = ws.addRow([f.cuentaRussell, c.cuenta, c.nombre, t.nit ?? "", t.nombre ?? "", t.saldoInicial, t.saldo, nota]);
        const tachada = { strike: true, color: { argb: EXCEL.textoSecundario } };
        if (terceroTachado(t)) fila.font = tachada;
        else if (t.saldoInicialRestado) fila.getCell(6).font = tachada;
      }
    }
  }

  if (resultado.fueraDelMapeo.length > 0) {
    ws.addRow([]);
    filaSeccion(ws, "Cuentas de retención fuera del cruce (no suman)", 8);
    estiloEncabezado(ws.addRow(["Cuenta Russell", "Cuentas del cliente", "", "", "", "", "Saldo final"]));
    for (const f of resultado.fueraDelMapeo) ws.addRow([f.cuentaRussell, f.cuentas.join(", "), "", "", "", "", f.saldo]);
  }

  const fueraDeRetencion = resultado.fueraDeRetencion ?? [];
  if (fueraDeRetencion.length > 0) {
    ws.addRow([]);
    filaSeccion(ws, "Cuentas del cliente en 2365 o 2367 homologadas fuera de retención (no llegan al cruce)", 8);
    estiloEncabezado(ws.addRow(["Cuenta del cliente", "Nombre", "Homologada a", "Nombre de la cuenta Russell", "", "", "Saldo final"]));
    for (const f of fueraDeRetencion) ws.addRow([f.cuenta, f.nombre ?? "", f.cuentaRussell ?? "Sin homologar", f.nombreRussell ?? "", "", "", f.saldo]);
  }

  const marcas = resultado.grupos.flatMap((g) => g.filas).filter((f) => f.marca);
  if (marcas.length > 0) {
    ws.addRow([]);
    filaSeccion(ws, "Observaciones · marcas del cruce", 8);
    estiloEncabezado(ws.addRow(["Marca", "Concepto", "Explicación", "Referencia", "Diferencia al marcar", "Diferencia de hoy", "Marcada por", "Fecha"]));
    for (const f of marcas.sort((a, b) => a.marca!.numero - b.marca!.numero)) {
      const m = f.marca!;
      ws.addRow([m.vigente ? m.numero : `${m.numero} (desactualizada)`, etiquetaFilaCruce(f), m.nota, m.referenciaAnexo ?? "", m.diferencia, f.diferencia, m.marcadoPor ?? "", m.marcadoEn.slice(0, 10)]);
    }
  }

  [58, 16, 30, 18, 30, 18, 18, 22].forEach((w, i) => (ws.getColumn(i + 1).width = w));
  for (const c of [4, 5, 6, 7]) ws.getColumn(c).numFmt = PESOS_CENTAVOS;
}

const fechaExcel = (iso: string | null) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : "");

/** Hoja «Oportunidad»: vencimiento, presentación del original y pago de los conceptos 61 y 62 por período, con su estado. */
function hojaOportunidad(wb: ExcelJS.Workbook, meta: MetaRevisionExcel, filas: readonly FilaOportunidad[]): void {
  const ws = wb.addWorksheet("Oportunidad");
  encabezadoLibro(ws, meta, "indicador de oportunidad");
  ws.addRow(["Vencimiento por el último dígito del NIT sin el DV; presentación del 350 original; pago del último 490 del concepto 61 (renta) y del 62 (reteIVA)."]).font = { color: { argb: EXCEL.textoSecundario } };
  estiloEncabezado(ws.addRow([
    "Período", "350 (original)", "Autoadhesivo 350", "Recibo 61", "Autoadhesivo 61", "Recibo 62", "Autoadhesivo 62", "Fecha de vencimiento", "Fecha de presentación",
    "Fecha de pago 61", "Fecha de pago 62", "Estado presentación", "Estado pago 61", "Estado pago 62", "Marca",
  ]));
  for (const f of filas) {
    const estado = (e: FilaOportunidad["estadoPresentacion"], dias: number | null) => `${ETIQUETA_OPORTUNIDAD[e]}${dias ? ` (${dias} día(s))` : ""}`;
    ws.addRow([
      etiquetaPeriodoRevision(meta.periodicidad, f.periodo), f.numero350 ?? "", f.autoadhesivo350 ?? "",
      f.pago61.numero ?? "", f.pago61.autoadhesivo ?? "", f.pago62.numero ?? "", f.pago62.autoadhesivo ?? "",
      fechaExcel(f.vencimiento), fechaExcel(f.presentacion), fechaExcel(f.pago61.fecha), fechaExcel(f.pago62.fecha),
      estado(f.estadoPresentacion, f.diasPresentacion), estado(f.pago61.estado, f.pago61.dias), estado(f.pago62.estado, f.pago62.dias),
      f.marca ? `Marca ${f.marca.numero}: ${f.marca.nota}` : f.requiereMarca ? "Sin marca" : "",
    ]);
  }
  [12, 16, 18, 16, 18, 16, 18, 21, 22, 16, 16, 22, 22, 22, 50].forEach((w, i) => (ws.getColumn(i + 1).width = w));
}

/** Hoja «Pagos efectuados»: lo declarado (136, 137, 138) contra lo pagado con los 490, con el desglose por concepto. */
function hojaPagos(wb: ExcelJS.Workbook, meta: MetaRevisionExcel, pagos: ResultadoPagos): void {
  const ws = wb.addWorksheet("Pagos efectuados");
  encabezadoLibro(ws, meta, "pagos efectuados");
  ws.addRow(["Diferencia = Total pagado antes de intereses − Total (138): positiva si se pagó de más y negativa si se pagó de menos; los intereses de mora van aparte y no se comparan. Se compara al peso."]).font = { color: { argb: EXCEL.textoSecundario } };
  estiloEncabezado(ws.addRow(["Período", "Retenciones (136)", "Sanciones (137)", "Total (138)", "Impuesto pagado (36)", "Sanción pagada (34)", "Total pagado antes de intereses", "Diferencia", "Estado", "61 vs 130", "62 vs 134", "63 vs 135", "Alerta", "Intereses pagados (35)", "Marca"]));
  for (const f of pagos.filas) {
    const desglose = (c: string) => f.desglose.find((d) => d.concepto === c)?.diferencia ?? null;
    ws.addRow([
      etiquetaPeriodoRevision(meta.periodicidad, f.periodo), f.retenciones, f.sanciones, f.totalDeclarado, f.impuestoPagado, f.sancionPagada, f.totalPagado, f.diferencia,
      ETIQUETA_PAGO[f.estado], desglose("61"), desglose("62"), desglose("63"), [...conceptosSinRecibo(f).map(alertaSinRecibo), ...(f.recibosDeOtro350 ?? []).map(alertaReciboDeOtro350)].join(" · "), f.intereses,
      f.marca ? `Marca ${f.marca.numero}${f.marca.vigente ? "" : " (desactualizada)"}: ${f.marca.nota}` : f.requiereMarca ? "Sin marca" : "",
    ]);
  }
  const t = pagos.total;
  ws.addRow(["Total", t.retenciones, t.sanciones, t.totalDeclarado, t.impuestoPagado, t.sancionPagada, t.totalPagado, t.diferencia, null, null, null, null, null, t.intereses]).font = { bold: true };
  [12, 17, 15, 17, 18, 17, 17, 15, 20, 14, 14, 14, 26, 20, 50].forEach((w, i) => (ws.getColumn(i + 1).width = w));
  for (let c = 2; c <= 14; c++) if (c !== 9 && c !== 13) ws.getColumn(c).numFmt = PESOS_CENTAVOS;
}

export type ResultadosExcel = { cruce: CruceRetencionVista; oportunidad?: readonly FilaOportunidad[]; pagos?: ResultadoPagos };

export function libroRetencion(meta: MetaRevisionExcel, vista: VistaRevision, formularios: readonly FormularioExcel[], resultados?: ResultadosExcel): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Russell Conciliador";
  hojaPorMeses(wb, meta, vista);
  hojaAcumulado(wb, meta, vista);
  hojaFormularios(wb, meta, formularios);
  if (resultados) hojaCruce(wb, meta, resultados.cruce);
  if (resultados?.oportunidad) hojaOportunidad(wb, meta, resultados.oportunidad);
  if (resultados?.pagos) hojaPagos(wb, meta, resultados.pagos);
  return wb;
}

export async function excelRetencion(meta: MetaRevisionExcel, vista: VistaRevision, formularios: readonly FormularioExcel[], resultados?: ResultadosExcel): Promise<Buffer> {
  return escribirLibroMarca(libroRetencion(meta, vista, formularios, resultados));
}
