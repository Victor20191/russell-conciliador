// Exportación a Excel de una revisión de Impuestos · DIAN (puro, sin BD): las vistas «Por meses»
// (o «Por períodos» en IVA) y «Acumulado» (no en IVA anual, donde sería igual), la lista de formularios cargados, el cruce contable con todos sus terceros, el
// indicador de oportunidad, los pagos efectuados y, si el cruce los resta, los saldos restados de los NITs con saldo inicial a enero.
// La marca la aplica `escribirLibroMarca`.

import ExcelJS from "exceljs";
import { renglonDeFila, unidadPlural, vistaConPersonas, type VistaRevision } from "@/lib/impuestos/retencion/vistas";
import { alcanceSaldoInicial, controlesPorPagarDe, cuentasDeFilaCruce, etiquetaFilaCruce, impuestoDelCruce, renglonesFilaCruce, terceroTachado, type CruceRetencionVista, type DetalleSaldoInicialRestado, type FilaCruce } from "@/lib/impuestos/retencion/cruce";
import { etiquetaOportunidad, pagosDeFila, type FilaOportunidad } from "@/lib/impuestos/retencion/oportunidad";
import { alertaReciboDeOtro350, alertaRecibosSin350, alertaSinRecibo, conceptosSinRecibo, etiquetaPago, type ResultadoPagos } from "@/lib/impuestos/retencion/pagos";
import { IMPUESTOS, midePresentacion, renglonSanciones, RETENCION, type ImpuestoDian } from "@/lib/impuestos/impuestos-dian";
import { rotuloRenglon } from "@/lib/impuestos/formularios/definicion";
import { etiquetaPeriodoRevision } from "@/lib/impuestos/retencion/periodos-revision";
import { ETIQUETA_RECIBO_POR_PAGAR, etiquetaRenglonPorPagar } from "@/lib/impuestos/retencion/por-pagar";
import { EXCEL, escribirLibroMarca, estiloEncabezado, rellenoMarca } from "./marca-excel";
import { ETIQUETAS_ICA, fallasMunicipioIca, nombreMunicipioIca, RENGLONES_ICA, type MunicipioIca } from "@/lib/impuestos/rst/ica-municipios";

const PESOS = "#,##0";

export type MetaRevisionExcel = {
  /** El nombre del impuesto en los títulos; sin él, Retención en la fuente. */
  impuesto?: string;
  cliente: string;
  nit: string;
  anio: number;
  /** El corte en una frase, con su año: «Precierre con fecha de corte al 31 de agosto de 2026». */
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
  /** Solo el 2593: la hoja 2 (ICA por municipio) que leyó la IA. */
  ica?: readonly MunicipioIca[];
};

function encabezadoLibro(ws: ExcelJS.Worksheet, meta: MetaRevisionExcel, titulo: string): void {
  ws.addRow([`${meta.impuesto ?? "Retención en la fuente"} · ${titulo}`]).font = { bold: true, size: 13, color: { argb: EXCEL.titulo } };
  ws.addRow([`${meta.cliente} · NIT ${meta.nit} · ${meta.corte} · periodicidad ${meta.periodicidad}`]).font = { color: { argb: EXCEL.textoSecundario } };
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
  const nombre = `Por ${unidadPlural(vista)}`;
  const ws = wb.addWorksheet(nombre);
  encabezadoLibro(ws, meta, nombre.toLowerCase());
  // Retención: dos columnas por mes (persona jurídica y natural). IVA: una por período.
  const personas = vistaConPersonas(vista);
  const ancho = personas ? 2 : 1;
  const columnas = 2 + vista.meses.length * ancho + 1;
  const falta = ` · falta el ${vista.codigo ?? "350"}`;
  const titulo = (m: VistaRevision["meses"][number]) =>
    `${m.etiqueta}${m.formulario ? ` · ${m.formulario.numero}${m.formulario.esCorreccion ? " (corrección)" : ""}` : m.causal ? " · sin formulario" : falta}`;
  const e1 = ws.addRow(["Concepto", "Renglón", ...vista.meses.flatMap((m) => (personas ? [titulo(m), ""] : [titulo(m)])), "Total"]);
  estiloEncabezado(e1);
  let ultimoEncabezado = e1.number;
  if (personas) {
    const e2 = ws.addRow(["", "", ...vista.meses.flatMap(() => ["P. jurídica", "P. natural"]), ""]);
    estiloEncabezado(e2, EXCEL.encabezadoSecundario);
    vista.meses.forEach((_, i) => ws.mergeCells(e1.number, 3 + i * 2, e1.number, 4 + i * 2));
    ultimoEncabezado = e2.number;
  }
  const unirMeses = (numero: number) => {
    if (personas) vista.meses.forEach((_, i) => ws.mergeCells(numero, 3 + i * 2, numero, 4 + i * 2));
  };
  for (const t of tramos(vista.filas)) {
    filaSeccion(ws, t.seccion, columnas);
    for (const f of t.filas) {
      const valores = f.tipo === "concepto" ? f.meses.flatMap((m) => [m.pj, m.pn]) : f.meses.flatMap((m) => (personas ? [m.valor, null] : [m.valor]));
      const renglon = renglonDeFila(f);
      const fila = ws.addRow([f.etiqueta, renglon, ...valores, f.total]);
      if (f.tipo !== "concepto") unirMeses(fila.number);
      if (f.tipo === "total") fila.font = { bold: true };
      if (f.detalle) sangria(fila);
    }
  }
  filaSeccion(ws, "Pagos · formulario 490", columnas);
  for (const p of vista.pagos) {
    const fila = ws.addRow([p.etiqueta, "", ...p.meses.flatMap((v) => (personas ? [v, null] : [v])), p.total]);
    unirMeses(fila.number);
    if (p.clave === "total_pagado") fila.font = { bold: true };
  }
  ws.getColumn(1).width = 58;
  ws.getColumn(2).width = 11;
  for (let c = 3; c <= columnas; c++) {
    ws.getColumn(c).width = personas ? 15 : 22;
    ws.getColumn(c).numFmt = PESOS;
  }
  ws.views = [{ state: "frozen", xSplit: 2, ySplit: ultimoEncabezado }];
}

/** Sangría de una fila de detalle (el ICA de cada municipio bajo el 76). Estilo copiado: ExcelJS comparte los objetos de estilo. */
function sangria(fila: ExcelJS.Row): void {
  const celda = fila.getCell(1);
  celda.style = { ...celda.style, alignment: { ...(celda.style.alignment ?? {}), indent: 2 } };
}

function hojaAcumulado(wb: ExcelJS.Workbook, meta: MetaRevisionExcel, vista: VistaRevision): void {
  const ws = wb.addWorksheet("Acumulado");
  encabezadoLibro(ws, meta, "acumulado");
  const conFormulario = vista.meses.filter((m) => m.formulario).length;
  const personas = vistaConPersonas(vista);
  ws.addRow([`Suma de ${conFormulario} de ${vista.meses.length} ${unidadPlural(vista)} con ${vista.codigo ?? "350"} hasta el corte.`]).font = { color: { argb: EXCEL.textoSecundario } };
  // Retención: renglón de cada persona. IVA: un renglón.
  const columnas = personas ? 4 : 3;
  estiloEncabezado(ws.addRow(personas ? ["Concepto", "Renglón P. jurídica", "Renglón P. natural", "Total"] : ["Concepto", "Renglón", "Total"]));
  for (const t of tramos(vista.filas)) {
    filaSeccion(ws, t.seccion, columnas);
    for (const f of t.filas) {
      const fila = ws.addRow(
        f.tipo === "concepto" ? [f.etiqueta, f.renglonPj ?? "—", f.renglonPn ?? "—", f.total] : personas ? [f.etiqueta, f.renglonPj, "", f.total] : [f.etiqueta, f.rotulo ?? f.renglonPj, f.total],
      );
      if (f.tipo === "total") fila.font = { bold: true };
      if (f.detalle) sangria(fila);
    }
  }
  filaSeccion(ws, "Pagos · formulario 490", columnas);
  for (const p of vista.pagos) {
    const fila = ws.addRow(personas ? [p.etiqueta, "", "", p.total] : [p.etiqueta, "", p.total]);
    if (p.clave === "total_pagado") fila.font = { bold: true };
  }
  ws.getColumn(1).width = 64;
  for (let c = 2; c <= columnas; c++) ws.getColumn(c).width = 18;
  ws.getColumn(columnas).numFmt = PESOS;
}

function hojaFormularios(wb: ExcelJS.Workbook, meta: MetaRevisionExcel, formularios: readonly FormularioExcel[], codigo: string): void {
  const ws = wb.addWorksheet("Formularios");
  encabezadoLibro(ws, meta, "formularios cargados");
  // El 2593 se «ajusta» (casillas 24 y 25) y no tiene sello: su fecha va vacía.
  estiloEncabezado(ws.addRow(["Período", "Formulario", "Número", "Estado", codigo === "2593" ? "Ajusta a" : "Corrige a", "Concepto", `${codigo} que paga`, "Fecha del sello (997)", "Autoadhesivo (996)", "Corregidos a mano"]));
  for (const f of formularios) {
    ws.addRow([f.periodo, f.formulario, f.numero, f.estado, f.correccionDe ?? "", f.concepto ?? "", f.numeroPagado ?? "", f.fecha ?? "", f.autoadhesivo ?? "", f.corregidoAMano]);
  }
  [codigo === "350" ? 12 : 30, 11, 16, 14, 16, 10, 16, 20, 20, 20].forEach((w, i) => (ws.getColumn(i + 1).width = w));
}

/**
 * Hoja «ICA por municipio» (anticipos del Régimen Simple): una fila por municipio de la hoja 2 de cada
 * 2593 con sus casillas y, debajo, sus actividades gravadas (CIIU, ingresos, tarifa e impuesto).
 */
function hojaIcaMunicipios(wb: ExcelJS.Workbook, meta: MetaRevisionExcel, formularios: readonly FormularioExcel[]): void {
  const conIca = formularios.filter((f) => f.formulario === "2593");
  if (conIca.length === 0) return;
  const ws = wb.addWorksheet("ICA por municipio");
  encabezadoLibro(ws, meta, "hoja 2 del 2593: ICA por municipio");
  const columnas = 8 + RENGLONES_ICA.length;
  estiloEncabezado(ws.addRow(["Período", "Recibo 2593", "Estado", "Municipio", "Cód. depto.", "Cód. municipio", "Página", "Fórmulas", ...RENGLONES_ICA.map((r) => `${r} · ${ETIQUETAS_ICA[r]}`)]));
  for (const f of conIca) {
    const municipios = f.ica ?? [];
    if (municipios.length === 0) {
      ws.addRow([f.periodo, f.numero, f.estado, "No se leyó la hoja 2"]);
      continue;
    }
    municipios.forEach((m, i) => {
      const fallas = fallasMunicipioIca(m);
      ws.addRow([
        f.periodo, f.numero, f.estado, nombreMunicipioIca(m, i), m.codigoDepartamento ?? "", m.codigoMunicipio ?? "", m.pagina ?? "",
        fallas.length === 0 ? "Cuadran" : fallas.join("; "),
        ...RENGLONES_ICA.map((r) => m.valores[r] ?? null),
      ]);
    });
  }
  ws.addRow([]);
  filaSeccion(ws, "Actividades gravadas por municipio", 8);
  estiloEncabezado(ws.addRow(["Período", "Recibo 2593", "Municipio", "CIIU (91)", "Ingresos gravados (92)", "Tarifa por mil (93)", "Impuesto (94)"]));
  for (const f of conIca) {
    (f.ica ?? []).forEach((m, i) => {
      for (const a of m.actividades) {
        const fila = ws.addRow([f.periodo, f.numero, nombreMunicipioIca(m, i), a.ciiu ?? "", a.ingresosGravados, a.tarifaPorMil, a.impuesto]);
        fila.getCell(5).numFmt = PESOS;
        fila.getCell(7).numFmt = PESOS;
      }
    });
  }
  [30, 16, 14, 28, 12, 14, 9, 40, ...RENGLONES_ICA.map(() => 18)].forEach((w, i) => (ws.getColumn(i + 1).width = w));
  for (let c = 9; c <= columnas; c++) ws.getColumn(c).numFmt = PESOS;
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
  const impuesto = impuestoDelCruce(resultado);
  const contabilidad = impuesto.cruce.textos.contabilidadExcel;
  ws.addRow([`${contabilidad} Diferencias desde ${cruce.umbral.toLocaleString("es-CO")} exigen marca.`]).font = { color: { argb: EXCEL.textoSecundario } };
  if (!cruce.inicioEnero) ws.addRow(["El balance no empieza el 1 de enero: no se mide el saldo inicial de los terceros."]).font = { color: { argb: EXCEL.textoSecundario } };
  if (resultado.saldoInicial?.restado) {
    ws.addRow([`Se restó el saldo inicial de ${alcanceSaldoInicial(resultado.saldoInicial)}, por ${resultado.saldoInicial.monto.toLocaleString("es-CO")} (el balance empieza el 1 de enero: se resta siempre): cada tercero suma solo lo del año.`]).font = { color: { argb: EXCEL.textoSecundario } };
  }
  ws.addRow([]);

  estiloEncabezado(ws.addRow(["Concepto", "Cuenta Russell", "Renglones", "Declaraciones", "Contabilidad", "Diferencia", "Estado", "Marca"]));
  for (const g of resultado.grupos) {
    filaSeccion(ws, g.etiqueta, 8);
    for (const f of g.filas) {
      ws.addRow([etiquetaFilaCruce(f), f.cuentaRussell ? cuentasDeFilaCruce(f).join(", ") : "Sin cuenta", renglonesFilaCruce(f), f.declarado, f.cuentaRussell ? f.contable : null, f.diferencia, ETIQUETA_NIVEL[f.nivel], estadoMarca(f)]);
    }
    ws.addRow([`Subtotal · ${g.etiqueta}`, "", "", g.subtotal.declarado, g.subtotal.contable, g.subtotal.diferencia]).font = { bold: true };
  }
  if (impuesto.cruce.conTotalGeneral) ws.addRow(["Total retenciones (136)", "", "", resultado.total.declarado, resultado.total.contable, resultado.total.diferencia]).font = { bold: true };

  ws.addRow([]);
  filaSeccion(ws, "Detalle contable por tercero (saldo final al corte, en positivo)", 8);
  estiloEncabezado(ws.addRow(["Cuenta Russell", "Cuenta del cliente", "Nombre de la cuenta", "NIT", "Tercero", "Saldo inicial", "Saldo final", "Observación"]));
  for (const f of resultado.grupos.flatMap((g) => g.filas)) {
    for (const c of f.cuentasCliente) {
      // Ingresos de IVA: el saldo de la cuenta, sin terceros.
      if (c.porCuenta) {
        ws.addRow([cuentasDeFilaCruce(f).join(", "), c.cuenta, c.nombre, "", "", null, c.saldo, "Saldo de la cuenta (sin terceros)"]);
        continue;
      }
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

  // Los controles por pagar (RST: consumo, IVA e ICA): no suman, no exigen marca ni impiden cerrar.
  const controles = controlesPorPagarDe(resultado);
  if (controles.length > 0) {
    const codigo = impuesto.declaracion.codigo;
    const periodicidad = impuesto.periodicidades[0] ?? "Bimestral";
    ws.addRow([]);
    filaSeccion(ws, `Lo que falta pagar al ${fechaExcel(controles[0].fechaCorte)} · controles (no suman ni exigen marca)`, 8);
    if (impuesto.cruce.textos.porPagar) ws.addRow([impuesto.cruce.textos.porPagar]).font = { color: { argb: EXCEL.textoSecundario } };
    for (const c of controles) {
      const renglon = etiquetaRenglonPorPagar(c);
      ws.addRow([]);
      ws.addRow([c.contabilidad ? `${c.titulo}: la ${renglon} de los recibos sin pagar al corte contra ${c.contabilidad}.` : c.titulo]).font = { bold: true, color: { argb: EXCEL.titulo } };
      estiloEncabezado(ws.addRow(["Período", "Recibo", `Casilla ${c.renglon}`, "Recibo 490", "Fecha de pago", "Estado al corte", "Por pagar al corte"]));
      for (const r of c.recibos) {
        ws.addRow([etiquetaPeriodoRevision(periodicidad, r.periodo), r.numero, r.valor, r.pago?.numero ?? "", fechaExcel(r.pago?.fecha ?? null), ETIQUETA_RECIBO_POR_PAGAR[r.estado], r.porPagar]);
      }
      for (const p of c.periodosSinRecibo) ws.addRow([etiquetaPeriodoRevision(periodicidad, p), `Sin recibo ${codigo} ni causal`]);
      estiloEncabezado(ws.addRow(["Cuenta del cliente", "Nombre", "Homologada a", "Nombre de la cuenta Russell", "", "", "Saldo por pagar"]));
      for (const x of c.cuentas) ws.addRow([x.cuenta, x.nombre, x.cuentaRussell, x.nombreRussell ?? "", "", "", x.saldo]);
      ws.addRow([`Por pagar según los recibos ${codigo} (${renglon})`, "", "", "", "", "", c.porPagarRecibos]).font = { bold: true };
      ws.addRow(["Por pagar según la contabilidad", "", "", "", "", "", c.porPagarContable]).font = { bold: true };
      ws.addRow([`Diferencia · ${c.nivel === "alerta" ? "aviso en Novedades" : ETIQUETA_NIVEL[c.nivel]}`, "", "", "", "", "", c.diferencia]).font = { bold: true };
    }
  }

  if (resultado.fueraDelMapeo.length > 0) {
    ws.addRow([]);
    filaSeccion(ws, `${impuesto.cruce.textos.fueraDelMapeo.titulo} (no suman)`, 8);
    estiloEncabezado(ws.addRow(["Cuenta Russell", "Cuentas del cliente", "", "", "", "", "Saldo final"]));
    for (const f of resultado.fueraDelMapeo) ws.addRow([f.cuentaRussell, f.cuentas.join(", "), "", "", "", "", f.saldo]);
  }

  const fueraDeRetencion = resultado.fueraDeRetencion ?? [];
  if (fueraDeRetencion.length > 0) {
    ws.addRow([]);
    filaSeccion(ws, `Cuentas del cliente en ${impuesto.cruce.prefijosCliente.join(" o ")} homologadas fuera de ${impuesto.cruce.textos.fueraDe} (no llegan al cruce)`, 8);
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

/** El impuesto del libro, por el nombre de la meta; sin él, Retención en la fuente. */
const impuestoDeMeta = (meta: MetaRevisionExcel): ImpuestoDian => IMPUESTOS.find((i) => i.nombre === meta.impuesto) ?? RETENCION;

const fechaExcel = (iso: string | null) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : "");

/** Hoja «Oportunidad»: vencimiento, presentación del original y pago de cada columna del impuesto (61 y 62 en Retención, el 490 en IVA) por período, con su estado. */
function hojaOportunidad(wb: ExcelJS.Workbook, meta: MetaRevisionExcel, filas: readonly FilaOportunidad[]): void {
  const impuesto = impuestoDeMeta(meta);
  const codigo = impuesto.declaracion.codigo;
  const columnas = impuesto.columnasPago.map((c) => c.corta);
  // El 2593 no tiene sello de presentación: sin sus columnas ni la marca.
  const conPresentacion = midePresentacion(impuesto);
  const ws = wb.addWorksheet("Oportunidad");
  encabezadoLibro(ws, meta, "indicador de oportunidad");
  ws.addRow([
    !conPresentacion
      ? `Vencimiento por el último dígito del NIT sin el DV según el calendario «RST · Anticipo bimestral»; el ${codigo} no tiene sello de presentación: se mide el pago del último 490 concepto 27.`
      : impuesto.clave === RETENCION.clave
        ? "Vencimiento por el último dígito del NIT sin el DV; presentación del 350 original; pago del último 490 del concepto 61 (renta) y del 62 (reteIVA)."
        : `Vencimiento por el último dígito del NIT sin el DV según el calendario de la periodicidad (el de la declaración anual es el del año siguiente); presentación del ${codigo} original; pago del último 490 del concepto de la periodicidad.`,
  ]).font = { color: { argb: EXCEL.textoSecundario } };
  // Recibo 61 · Autoadhesivo 61 · Recibo 62 · … (Retención) o Recibo 490 · Autoadhesivo 490 (IVA).
  const recibo = (c: string) => (c === "490" ? "490" : c);
  const si = <T,>(condicion: boolean, valores: T[]): T[] => (condicion ? valores : []);
  estiloEncabezado(ws.addRow([
    "Período", ...si(conPresentacion, [`${codigo} (original)`, `Autoadhesivo ${codigo}`]),
    ...columnas.flatMap((c) => [`Recibo ${recibo(c)}`, `Autoadhesivo ${recibo(c)}`]),
    "Fecha de vencimiento", ...si(conPresentacion, ["Fecha de presentación"]),
    ...columnas.map((c) => `Fecha de pago ${recibo(c)}`),
    ...si(conPresentacion, ["Estado presentación"]),
    ...columnas.map((c) => `Estado pago ${recibo(c)}`),
    ...si(conPresentacion, ["Marca"]),
  ]));
  const estado = (e: FilaOportunidad["estadoPresentacion"], dias: number | null) => `${etiquetaOportunidad(e, codigo)}${dias ? ` (${dias} día(s))` : ""}`;
  for (const f of filas) {
    const pagos = pagosDeFila(f, impuesto).map((p) => p.pago);
    ws.addRow([
      etiquetaPeriodoRevision(meta.periodicidad, f.periodo), ...si(conPresentacion, [f.numero350 ?? "", f.autoadhesivo350 ?? ""]),
      ...pagos.flatMap((p) => [p.numero ?? "", p.autoadhesivo ?? ""]),
      fechaExcel(f.vencimiento), ...si(conPresentacion, [fechaExcel(f.presentacion)]),
      ...pagos.map((p) => fechaExcel(p.fecha)),
      ...si(conPresentacion, [estado(f.estadoPresentacion, f.diasPresentacion)]),
      ...pagos.map((p) => estado(p.estado, p.dias)),
      ...si(conPresentacion, [f.marca ? `Marca ${f.marca.numero}: ${f.marca.nota}` : ""]),
    ]);
  }
  const anchos = [
    12, ...si(conPresentacion, [16, 18]), ...columnas.flatMap(() => [16, 18]), 21, ...si(conPresentacion, [22]),
    ...columnas.map(() => 16), ...si(conPresentacion, [22]), ...columnas.map(() => 22), ...si(conPresentacion, [50]),
  ];
  anchos.forEach((w, i) => (ws.getColumn(i + 1).width = w));
}

/**
 * Hoja «Pagos efectuados»: lo declarado (136, 137, 138 en Retención; 86, 87, 88 en IVA) contra lo pagado
 * con los 490. Retención trae además el desglose de cada concepto contra su renglón (61 vs 130…); IVA
 * paga con un solo concepto y no lo necesita.
 */
function hojaPagos(wb: ExcelJS.Workbook, meta: MetaRevisionExcel, pagos: ResultadoPagos): void {
  const impuesto = impuestoDeMeta(meta);
  if (renglonSanciones(impuesto) == null) {
    hojaPagosComponentes(wb, meta, pagos, impuesto);
    return;
  }
  const codigo = impuesto.declaracion.codigo;
  const { renglones: r, etiquetasPago: e } = impuesto;
  const def = impuesto.declaracion;
  const rSan = renglonSanciones(impuesto);
  const conDesglose = impuesto.clave === RETENCION.clave;
  const conceptos = conDesglose ? impuesto.conceptosPago : [];
  const ws = wb.addWorksheet("Pagos efectuados");
  encabezadoLibro(ws, meta, "pagos efectuados");
  ws.addRow([
    rSan == null
      ? `Diferencia = Impuesto pagado (36) − ${e.total} (${rotuloRenglon(def, r.total)}): positiva si se pagó de más y negativa si se pagó de menos; la sanción (34) y los intereses de mora (35) del 490 van aparte y no se comparan. Se compara al peso.`
      : `Diferencia = Total pagado antes de intereses − ${e.total} (${r.total}): positiva si se pagó de más y negativa si se pagó de menos; los intereses de mora van aparte y no se comparan. Se compara al peso.`,
  ]).font = { color: { argb: EXCEL.textoSecundario } };
  estiloEncabezado(ws.addRow([
    "Período", `${e.impuesto} (${rotuloRenglon(def, r.impuesto)})`, rSan == null ? e.sanciones : `${e.sanciones} (${rSan})`, `${e.total} (${rotuloRenglon(def, r.total)})`, "Impuesto pagado (36)", "Sanción pagada (34)", "Total pagado antes de intereses", "Diferencia", "Estado",
    ...conceptos.map((c) => `${c.concepto} vs ${c.renglonPagado}`), "Alerta", "Intereses pagados (35)", "Marca",
  ]));
  for (const f of pagos.filas) {
    const desglose = (c: string) => f.desglose.find((d) => d.concepto === c)?.diferencia ?? null;
    ws.addRow([
      etiquetaPeriodoRevision(meta.periodicidad, f.periodo), f.retenciones, f.sanciones, f.totalDeclarado, f.impuestoPagado, f.sancionPagada, f.totalPagado, f.diferencia,
      etiquetaPago(f.estado, codigo), ...conceptos.map((c) => desglose(c.concepto)), [
        ...conceptosSinRecibo(f).map(alertaSinRecibo), ...(f.recibosDeOtro350 ?? []).map((x) => alertaReciboDeOtro350(x, codigo)),
        ...((f.recibosSin350 ?? []).length > 0 ? [alertaRecibosSin350(f.recibosSin350 ?? [], codigo)] : []),
      ].join(" · "), f.intereses,
      f.marca ? `Marca ${f.marca.numero}${f.marca.vigente ? "" : " (desactualizada)"}: ${f.marca.nota}` : f.requiereMarca ? "Sin marca" : "",
    ]);
  }
  const t = pagos.total;
  ws.addRow(["Total", t.retenciones, t.sanciones, t.totalDeclarado, t.impuestoPagado, t.sancionPagada, t.totalPagado, t.diferencia, null, ...conceptos.map(() => null), null, t.intereses]).font = { bold: true };
  const colEstado = 9;
  const colAlerta = colEstado + conceptos.length + 1;
  const colIntereses = colAlerta + 1;
  [12, 17, 15, 17, 18, 17, 17, 15, 20, ...conceptos.map(() => 14), 26, 20, 50].forEach((w, i) => (ws.getColumn(i + 1).width = w));
  for (let c = 2; c <= colIntereses; c++) if (c !== colEstado && c !== colAlerta) ws.getColumn(c).numFmt = PESOS_CENTAVOS;
}

/**
 * «Pagos efectuados» de una declaración sin sanciones (el 2593 del Régimen Simple): los valores a pagar
 * (76 a 79) y su total contra el impuesto pagado (36); la sanción (34) y los intereses (35), aparte.
 */
function hojaPagosComponentes(wb: ExcelJS.Workbook, meta: MetaRevisionExcel, pagos: ResultadoPagos, impuesto: ImpuestoDian): void {
  const def = impuesto.declaracion;
  const codigo = def.codigo;
  const componentes = impuesto.componentesPago ?? [];
  const valorDe = (lista: readonly { renglon: number; valor: number }[] | undefined, renglon: number) => lista?.find((c) => c.renglon === renglon)?.valor ?? 0;
  const ws = wb.addWorksheet("Pagos efectuados");
  encabezadoLibro(ws, meta, "pagos efectuados");
  ws.addRow([
    `Diferencia = Impuesto pagado antes de sanción e intereses (36) − ${impuesto.etiquetasPago.total} (${rotuloRenglon(def, impuesto.renglones.total)}): positiva si se pagó de más y negativa si se pagó de menos; la sanción (34) y los intereses de mora (35) del 490 van aparte y no se comparan. Se compara al peso.`,
  ]).font = { color: { argb: EXCEL.textoSecundario } };
  estiloEncabezado(ws.addRow([
    "Período", ...componentes.map((c) => `${c.etiqueta} (${c.renglon})`), `${impuesto.etiquetasPago.total} (${rotuloRenglon(def, impuesto.renglones.total)})`,
    "Impuesto pagado antes de sanción e intereses (36)", "Diferencia", "Estado", "Alerta", "Sanción pagada (34)", "Intereses pagados (35)", "Marca",
  ]));
  for (const f of pagos.filas) {
    ws.addRow([
      etiquetaPeriodoRevision(meta.periodicidad, f.periodo), ...componentes.map((c) => valorDe(f.componentes, c.renglon)), f.totalDeclarado,
      f.impuestoPagado, f.diferencia, etiquetaPago(f.estado, codigo),
      [
        ...conceptosSinRecibo(f).map(alertaSinRecibo), ...(f.recibosDeOtro350 ?? []).map((x) => alertaReciboDeOtro350(x, codigo)),
        ...((f.recibosSin350 ?? []).length > 0 ? [alertaRecibosSin350(f.recibosSin350 ?? [], codigo)] : []),
      ].join(" · "),
      f.sancionPagada, f.intereses,
      f.marca ? `Marca ${f.marca.numero}${f.marca.vigente ? "" : " (desactualizada)"}: ${f.marca.nota}` : f.requiereMarca ? "Sin marca" : "",
    ]);
  }
  const t = pagos.total;
  ws.addRow(["Total", ...componentes.map((c) => valorDe(pagos.totalComponentes, c.renglon)), t.totalDeclarado, t.impuestoPagado, t.diferencia, null, null, t.sancionPagada, t.intereses]).font = { bold: true };
  const colEstado = 2 + componentes.length + 3;
  const colAlerta = colEstado + 1;
  [12, ...componentes.map(() => 17), 20, 18, 15, 20, 26, 18, 20, 50].forEach((w, i) => (ws.getColumn(i + 1).width = w));
  for (let c = 2; c <= colAlerta + 2; c++) if (c !== colEstado && c !== colAlerta) ws.getColumn(c).numFmt = PESOS_CENTAVOS;
}

/** Hoja «Saldos restados»: los NITs con saldo inicial a enero a los que el cruce les resta ese saldo inicial, cuenta por cuenta, con su marca. */
function hojaSaldoInicialRestado(wb: ExcelJS.Workbook, meta: MetaRevisionExcel, d: DetalleSaldoInicialRestado): void {
  const ws = wb.addWorksheet("Saldos restados");
  encabezadoLibro(ws, meta, "saldos restados: NITs con saldo inicial a enero");
  ws.addRow([`El cruce contable les resta de su saldo final el saldo inicial que traían a enero (${alcanceSaldoInicial(d)}); se hace siempre que el balance del corte empieza el 1 de enero. Saldos con los signos del cruce: el pasivo en positivo.`]).font = { color: { argb: EXCEL.textoSecundario } };
  ws.addRow([d.marca ? `Marca ${d.marca.numero}${d.marca.vigente ? "" : " (desactualizada)"}: ${d.marca.nota}` : "Sin marca: es obligatoria para cerrar en firme."]).font = { color: { argb: EXCEL.textoSecundario } };
  estiloEncabezado(ws.addRow(["NIT", "Tercero", "Cuenta del cliente", "Nombre de la cuenta", "Cuenta Russell", "Saldo inicial", "Saldo final", "Restado"]));
  for (const f of d.filas) ws.addRow([f.nit ?? "", f.nombre ?? "", f.cuentaCliente, f.nombreCuenta, f.cuentaRussell ?? "", f.saldoInicial, f.saldoFinal, f.restado]);
  ws.addRow(["Total restado", null, null, null, null, null, null, d.total]).font = { bold: true };
  [16, 40, 18, 40, 15, 18, 18, 18].forEach((w, i) => (ws.getColumn(i + 1).width = w));
  for (const c of [6, 7, 8]) ws.getColumn(c).numFmt = PESOS_CENTAVOS;
}

export type ResultadosExcel = { cruce: CruceRetencionVista; oportunidad?: readonly FilaOportunidad[]; pagos?: ResultadoPagos; saldoInicialRestado?: DetalleSaldoInicialRestado | null };

export function libroRetencion(meta: MetaRevisionExcel, vista: VistaRevision, formularios: readonly FormularioExcel[], resultados?: ResultadosExcel): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Russell Conciliador";
  hojaPorMeses(wb, meta, vista);
  // Con periodicidad anual hay un solo período: el acumulado sería igual.
  if (meta.periodicidad !== "Anual") hojaAcumulado(wb, meta, vista);
  hojaFormularios(wb, meta, formularios, vista.codigo ?? "350");
  hojaIcaMunicipios(wb, meta, formularios);
  // Sin cruce disponible para el impuesto no hay hoja de cruce.
  if (resultados && impuestoDeMeta(meta).cruce.disponible) hojaCruce(wb, meta, resultados.cruce);
  if (resultados?.oportunidad) hojaOportunidad(wb, meta, resultados.oportunidad);
  if (resultados?.pagos) hojaPagos(wb, meta, resultados.pagos);
  if (resultados?.saldoInicialRestado) hojaSaldoInicialRestado(wb, meta, resultados.saldoInicialRestado);
  return wb;
}

export async function excelRetencion(meta: MetaRevisionExcel, vista: VistaRevision, formularios: readonly FormularioExcel[], resultados?: ResultadosExcel): Promise<Buffer> {
  return escribirLibroMarca(libroRetencion(meta, vista, formularios, resultados));
}
