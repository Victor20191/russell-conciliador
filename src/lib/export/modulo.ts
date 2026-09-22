// Exportación a Excel de un DATO CARGADO de módulo (Inventarios, Cartera, CxP…):
// lo que se ve en `/modulos/[codigo]/[id]`, en dos hojas:
//  - "Detalle": una fila por ítem con las columnas del descriptor del módulo, agrupadas
//    por clasificador con subtotal en NEGRILLA y agrupación colapsable (outline), y un
//    total general al pie con FÓRMULA VIVA (suma de los subtotales).
//  - "Consolidado": total por clasificador con sus cuentas Russell (4 díg.) asignadas.
// Puro (sin BD): recibe los view-models ya resueltos por el loader RSC.
import ExcelJS from "exceljs";
import { coincidenciaTercero } from "@/lib/modulos/cartera/coincidencia-tercero";
import type { EstadoCruceTercero, FilaCruceTerceroCartera, ResumenCruceTerceroCartera } from "@/lib/modulos/cartera/cruce-tercero-cartera";
import { describirSenales } from "@/lib/modulos/cartera/coherencia-tercero";
import type { ControlDeduccionesNomina, VistaSubcuentaNomina } from "@/lib/modulos/nomina/cruce-nomina";
import { fechaDeCelda, valorColumnaDetalle } from "@/lib/modulos/celda-detalle-modulo";

/** `esValor` y `familia`, como en la pantalla: el saldo efectivo y los rangos de vencimiento. */
export type ColumnaExportModulo = { nombre: string; etiqueta: string; tipo: "texto" | "numero" | "moneda" | "fecha"; esValor?: boolean; familia?: { clave: string; etiqueta: string } };
/** `estado` (opcional, solo borradores): «Movimiento», «Agrupadora», «OMITIDA»… Si alguna
 *  fila lo trae, se agrega la columna «Estado». `valor` debe venir en 0 para las filas
 *  que NO se consolidan (agrupadoras/omitidas/en cero), así el subtotal iguala la pantalla. */
export type FilaExportModulo = {
  filaNum: number;
  clasificador: string | null;
  valor: number;
  datos: Record<string, string | number | null>;
  estado?: string | null;
  /** Valor de la fila aunque no consolide (borradores): lo muestra la columna del saldo. */
  saldo?: number;
};
export type ConsolidadoExportModulo = {
  clasificador: string;
  descripcion?: string | null;
  total: number;
  filas: number;
  cuentas4: { codigo: string; nombre: string | null }[];
};
export type MetaExportModulo = {
  modulo: string;
  cliente: string;
  periodo: string;
  version: number;
  archivo: string | null;
  generadoEn: Date;
};

const NUM_FMT = "#,##0.00;-#,##0.00";
const INT_FMT = "#,##0.##;-#,##0.##";
const HEADER_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEFF1F5" } };
const GRUPO_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFDDE3EC" } };
const TOTAL_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFC6D0DE" } };

const SIN_CLASIFICAR = "(sin clasificar)";
const esNum = (t: ColumnaExportModulo["tipo"]) => t === "moneda" || t === "numero";

/** Letra de columna Excel (1-based). */
const letra = (n: number): string => {
  let s = "";
  for (let x = n; x > 0; x = Math.floor((x - 1) / 26)) s = String.fromCharCode(65 + ((x - 1) % 26)) + s;
  return s;
};

/** Valor de celda tipado según la columna del descriptor. */
function celda(v: string | number | null | undefined, tipo: ColumnaExportModulo["tipo"]): ExcelJS.CellValue {
  if (v == null || v === "") return null;
  if (esNum(tipo)) {
    const n = Number(v);
    return Number.isFinite(n) ? n : String(v);
  }
  if (tipo === "fecha") {
    const iso = fechaDeCelda(v);
    return iso ? new Date(`${iso}T00:00:00Z`) : String(v);
  }
  return String(v);
}

function agruparPorClasificador(filas: FilaExportModulo[]) {
  const orden: string[] = [];
  const m = new Map<string, FilaExportModulo[]>();
  for (const f of filas) {
    const k = f.clasificador?.trim() || SIN_CLASIFICAR;
    let g = m.get(k);
    if (!g) { g = []; m.set(k, g); orden.push(k); }
    g.push(f);
  }
  return orden.map((k) => ({ clasificador: k, filas: m.get(k)! }));
}

function hojaDetalle(
  wb: ExcelJS.Workbook,
  columnas: ColumnaExportModulo[],
  clasificadorEtiqueta: string,
  detalle: FilaExportModulo[],
  meta: MetaExportModulo,
) {
  const ws = wb.addWorksheet("Detalle", { properties: { outlineProperties: { summaryBelow: false, summaryRight: false } } });
  const conEstado = detalle.some((f) => f.estado != null);
  ws.columns = [
    { header: "#", key: "filaNum", width: 8 },
    ...columnas.map((c) => ({ header: c.etiqueta, key: c.nombre, width: c.tipo === "texto" ? 34 : 18 })),
    ...(conEstado ? [{ header: "Estado", key: "estado", width: 22 }] : []),
    { header: "Valor consolidado", key: "valor", width: 20 },
  ];
  const nCols = columnas.length + (conEstado ? 3 : 2);
  const COL_VALOR = letra(nCols);
  // Encabezado descriptivo por encima de la tabla (título + metadatos).
  ws.spliceRows(1, 0, [], [], []);
  ws.getCell("A1").value = `${meta.modulo} · ${meta.cliente}`;
  ws.getCell("A1").font = { bold: true, size: 13 };
  ws.getCell("A2").value = `Período ${meta.periodo} · v${meta.version}${meta.archivo ? ` · ${meta.archivo}` : ""}`;
  ws.getCell("A2").font = { color: { argb: "FF6B7280" } };
  const HEADER_ROW = 4;
  const header = ws.getRow(HEADER_ROW);
  header.font = { bold: true };
  header.fill = HEADER_FILL;
  columnas.forEach((c, i) => {
    if (esNum(c.tipo)) header.getCell(i + 2).alignment = { horizontal: "right" };
  });
  header.getCell(nCols).alignment = { horizontal: "right" };
  ws.views = [{ state: "frozen", ySplit: HEADER_ROW }];

  const celdasSubtotal: string[] = [];
  for (const g of agruparPorClasificador(detalle)) {
    const rowGrupo = ws.addRow([`${clasificadorEtiqueta}: ${g.clasificador}`]);
    rowGrupo.font = { bold: true };
    rowGrupo.fill = GRUPO_FILL;
    ws.mergeCells(rowGrupo.number, 1, rowGrupo.number, nCols - 1);
    const primera = rowGrupo.number + 1;
    for (const f of g.filas) {
      const valores: ExcelJS.CellValue[] = [f.filaNum, ...columnas.map((c) => celda(valorColumnaDetalle({ valor: f.saldo ?? f.valor, datos: f.datos }, c), c.tipo)), ...(conEstado ? [f.estado ?? null] : []), f.valor];
      const row = ws.addRow(valores);
      row.outlineLevel = 1;
      columnas.forEach((c, i) => {
        const cell = row.getCell(i + 2);
        if (c.tipo === "moneda") cell.numFmt = NUM_FMT;
        else if (c.tipo === "numero") cell.numFmt = INT_FMT;
        else if (c.tipo === "fecha") cell.numFmt = "yyyy-mm-dd";
      });
      row.getCell(nCols).numFmt = NUM_FMT;
    }
    const ultima = ws.rowCount;
    // Subtotal VIVO del grupo: SUM de los valores de sus filas.
    const celdaSub = rowGrupo.getCell(nCols);
    celdaSub.value = g.filas.length > 0 ? { formula: `SUM(${COL_VALOR}${primera}:${COL_VALOR}${ultima})`, result: g.filas.reduce((a, f) => a + f.valor, 0) } : 0;
    celdaSub.numFmt = NUM_FMT;
    celdaSub.font = { bold: true };
    celdasSubtotal.push(`${COL_VALOR}${rowGrupo.number}`);
  }

  const rowTotal = ws.addRow(["TOTAL"]);
  rowTotal.font = { bold: true };
  rowTotal.fill = TOTAL_FILL;
  ws.mergeCells(rowTotal.number, 1, rowTotal.number, nCols - 1);
  const celdaTotal = rowTotal.getCell(nCols);
  celdaTotal.value = celdasSubtotal.length > 0
    ? { formula: `SUM(${celdasSubtotal.join(",")})`, result: detalle.reduce((a, f) => a + f.valor, 0) }
    : 0;
  celdaTotal.numFmt = NUM_FMT;
  ws.autoFilter = { from: { row: HEADER_ROW, column: 1 }, to: { row: HEADER_ROW, column: nCols } };
}

function hojaConsolidado(wb: ExcelJS.Workbook, clasificadorEtiqueta: string, consolidado: ConsolidadoExportModulo[], meta: MetaExportModulo) {
  const ws = wb.addWorksheet("Consolidado");
  ws.columns = [
    { header: clasificadorEtiqueta, key: "clasificador", width: 34 },
    { header: "Descripción", key: "descripcion", width: 34 },
    { header: "Ítems", key: "filas", width: 10 },
    { header: "Total", key: "total", width: 20 },
    { header: "Cuentas Russell", key: "cuentas", width: 48 },
  ];
  ws.spliceRows(1, 0, [], [], []);
  ws.getCell("A1").value = `${meta.modulo} · ${meta.cliente} · Consolidado`;
  ws.getCell("A1").font = { bold: true, size: 13 };
  ws.getCell("A2").value = `Período ${meta.periodo} · v${meta.version}`;
  ws.getCell("A2").font = { color: { argb: "FF6B7280" } };
  const HEADER_ROW = 4;
  ws.getRow(HEADER_ROW).font = { bold: true };
  ws.getRow(HEADER_ROW).fill = HEADER_FILL;
  ws.views = [{ state: "frozen", ySplit: HEADER_ROW }];

  const primera = HEADER_ROW + 1;
  for (const c of consolidado) {
    const row = ws.addRow({
      clasificador: c.clasificador,
      descripcion: c.descripcion ?? null,
      filas: c.filas,
      total: c.total,
      cuentas: c.cuentas4.length > 0 ? c.cuentas4.map((x) => (x.nombre ? `${x.codigo} ${x.nombre}` : x.codigo)).join("; ") : "Sin asignar",
    });
    row.getCell("total").numFmt = NUM_FMT;
  }
  const ultima = ws.rowCount;
  const rowTotal = ws.addRow({ clasificador: "TOTAL", filas: consolidado.reduce((a, c) => a + c.filas, 0) });
  rowTotal.font = { bold: true };
  rowTotal.fill = TOTAL_FILL;
  const celdaTotal = rowTotal.getCell("total");
  celdaTotal.value = consolidado.length > 0
    ? { formula: `SUM(D${primera}:D${ultima})`, result: consolidado.reduce((a, c) => a + c.total, 0) }
    : 0;
  celdaTotal.numFmt = NUM_FMT;
}

/** Fila del control de subtotales (borrador): subtotal del archivo vs. Σ movimientos de su bloque. */
export type ControlExportModulo = {
  clasificador: string;
  filaSubtotal: number;
  items: number;
  sumaMovimientos: number;
  subtotalArchivo: number;
  diferencia: number | null;
  estado: "cuadra" | "descuadre" | "no_validado";
};

function hojaControlSubtotales(wb: ExcelJS.Workbook, clasificadorEtiqueta: string, control: ControlExportModulo[], meta: MetaExportModulo) {
  const ws = wb.addWorksheet("Control totales");
  ws.columns = [
    { header: clasificadorEtiqueta, key: "clasificador", width: 34 },
    { header: "Fila subtotal", key: "filaSubtotal", width: 14 },
    { header: "Movimientos", key: "items", width: 13 },
    { header: "Σ movimientos", key: "sumaMovimientos", width: 20 },
    { header: "Total del archivo", key: "subtotalArchivo", width: 20 },
    { header: "Diferencia", key: "diferencia", width: 18 },
    { header: "Estado", key: "estado", width: 12 },
  ];
  ws.spliceRows(1, 0, [], [], []);
  ws.getCell("A1").value = `${meta.modulo} · ${meta.cliente} · Control de totales del archivo`;
  ws.getCell("A1").font = { bold: true, size: 13 };
  ws.getCell("A2").value = `Período ${meta.periodo} · v${meta.version} · los subtotales no se cargan: se comparan contra la suma de sus movimientos`;
  ws.getCell("A2").font = { color: { argb: "FF6B7280" } };
  const HEADER_ROW = 4;
  ws.getRow(HEADER_ROW).font = { bold: true };
  ws.getRow(HEADER_ROW).fill = HEADER_FILL;
  ws.views = [{ state: "frozen", ySplit: HEADER_ROW }];
  for (const c of control) {
    const row = ws.addRow({
      ...c,
      estado: c.estado === "cuadra" ? "SÍ COINCIDE" : c.estado === "descuadre" ? "NO COINCIDE" : "NO VALIDADO",
    });
    for (const k of ["sumaMovimientos", "subtotalArchivo", "diferencia"]) row.getCell(k).numFmt = NUM_FMT;
    if (c.estado === "descuadre") row.font = { bold: true, color: { argb: "FFB91C1C" } };
    if (c.estado === "no_validado") row.font = { bold: true, color: { argb: "FF6B7280" } };
  }
}

/** Cruce por tercero del cargue, tal como lo muestra la pestaña. */
export type CruceTerceroExportModulo = {
  /** Con la marca de cada tercero cuando la tiene. */
  resumen: Omit<ResumenCruceTerceroCartera, "filas"> & {
    filas: (FilaCruceTerceroCartera & { marca?: { numero: number; nota: string } | null })[];
  };
  etiquetaClave: string;
  etiquetaNombre: string;
  /** De qué balance salió el lado contable, para el subtítulo. */
  fuente: string;
};

const ESTADO_CRUCE_TERCERO: Record<EstadoCruceTercero, string> = {
  cuadra: "Cuadra",
  descuadre: "Diferencia",
  solo_contable: "Solo en contabilidad",
  solo_modulo: "Solo en el módulo",
  sin_saldo: "Sin saldo",
};

function hojaCruceTercero(wb: ExcelJS.Workbook, cruce: CruceTerceroExportModulo, meta: MetaExportModulo) {
  const ws = wb.addWorksheet("Cruce por tercero");
  const { resumen } = cruce;
  const numericas = [...resumen.cuentas.map((c) => `c${c}`), "contable", "nacional", "exterior", "modulo", "diferencia"];
  ws.columns = [
    { header: cruce.etiquetaClave, key: "clave", width: 16 },
    { header: cruce.etiquetaNombre, key: "nombre", width: 40 },
    ...resumen.cuentas.map((c) => ({ header: c, key: `c${c}`, width: 18 })),
    { header: "Contabilidad", key: "contable", width: 20 },
    { header: "Módulo nacional", key: "nacional", width: 20 },
    { header: "Módulo exterior", key: "exterior", width: 20 },
    { header: "Módulo", key: "modulo", width: 20 },
    { header: "Diferencia", key: "diferencia", width: 18 },
    { header: "Estado", key: "estado", width: 22 },
    { header: "% coincidencia", key: "coincidencia", width: 16 },
    { header: "Observación", key: "observacion", width: 48 },
  ];
  ws.spliceRows(1, 0, [], [], []);
  ws.getCell("A1").value = `${meta.modulo} · ${meta.cliente} · Cruce por tercero`;
  ws.getCell("A1").font = { bold: true, size: 13 };
  ws.getCell("A2").value = `Período ${meta.periodo} · v${meta.version} · ${cruce.fuente}`;
  ws.getCell("A2").font = { color: { argb: "FF6B7280" } };
  const HEADER_ROW = 4;
  ws.getRow(HEADER_ROW).font = { bold: true };
  ws.getRow(HEADER_ROW).fill = HEADER_FILL;
  ws.views = [{ state: "frozen", ySplit: HEADER_ROW }];

  for (const f of resumen.filas) {
    const coincidencia = coincidenciaTercero(f);
    const row = ws.addRow({
      clave: f.sinNit ? null : f.clave,
      nombre: f.nombre,
      ...Object.fromEntries(resumen.cuentas.map((c) => [`c${c}`, f.contable.porCuenta[c] ?? 0])),
      contable: f.contable.total,
      nacional: f.modulo.nacional + f.modulo.sinOrigen,
      exterior: f.modulo.exterior,
      modulo: f.modulo.total,
      diferencia: f.diferencia,
      estado: ESTADO_CRUCE_TERCERO[f.estado],
      coincidencia: coincidencia == null ? null : coincidencia.porcentaje / 100,
      observacion: [
        f.sinNit ? "Sin NIT" : null,
        f.claveModuloPorDv ? `Emparejado por DV con ${f.claveModuloPorDv} del auxiliar` : null,
        f.claveModuloPorNucleo ? `Emparejado por núcleo con ${f.claveModuloPorNucleo}` : null,
        coincidencia && (coincidencia.tipo !== "cruzado" || coincidencia.propuesto) ? coincidencia.explicacion : null,
        f.sugerencia
          ? `Posible: ${f.sugerencia.clave.startsWith("~") ? "un tercero sin NIT" : f.sugerencia.clave} del otro lado (${describirSenales(f.sugerencia.senales)}; confianza ${f.sugerencia.confianza})`
          : null,
        f.emparejadoDesde.length > 0 ? `Emparejado con ${f.emparejadoDesde.join(", ")} del auxiliar` : null,
        f.separadoDe.length > 0 ? `Separado por el auditor de ${f.separadoDe.join(", ")} del auxiliar` : null,
        f.marca ? `Marca ${f.marca.numero}: ${f.marca.nota}` : null,
      ].filter(Boolean).join(" · ") || null,
    });
    for (const k of numericas) row.getCell(k).numFmt = NUM_FMT;
    row.getCell("coincidencia").numFmt = "0%";
    if (f.estado !== "cuadra" && f.estado !== "sin_saldo") row.font = { color: { argb: "FFB91C1C" } };
  }
  const total = ws.addRow({
    clave: "Totales",
    ...Object.fromEntries(resumen.cuentas.map((c) => [`c${c}`, resumen.totales.porCuenta[c] ?? 0])),
    contable: resumen.totales.contable,
    modulo: resumen.totales.modulo,
    diferencia: resumen.totales.diferencia,
  });
  total.font = { bold: true };
  total.fill = TOTAL_FILL;
  for (const k of numericas) total.getCell(k).numFmt = NUM_FMT;

  const notas: [string, number][] = [
    ["Contabilidad en cuentas que no hacen parte del módulo", resumen.contableFueraDelModulo.total],
    ["Contabilidad en cuentas sin detalle por tercero", resumen.contableSinTercero.total],
    ["Auxiliar en cuentas sin cuenta del módulo asignada en Consolidado", resumen.moduloFueraDelModulo.total],
    ["Auxiliar sin tercero identificado", resumen.moduloSinTercero.total],
  ];
  ws.addRow({});
  for (const [texto, valor] of notas) {
    if (valor === 0) continue;
    const row = ws.addRow({ nombre: texto, contable: valor });
    row.getCell("contable").numFmt = NUM_FMT;
    row.font = { color: { argb: "FF6B7280" } };
  }
}

/** Nómina: vista por subcuenta PUC y control de deducciones, tal como los muestra la pestaña. */
export type CruceNominaExportModulo = {
  vistaSubcuenta: VistaSubcuentaNomina | null;
  control: ControlDeduccionesNomina | null;
};

function hojaCruceSubcuenta(wb: ExcelJS.Workbook, nomina: CruceNominaExportModulo, meta: MetaExportModulo) {
  const vista = nomina.vistaSubcuenta;
  if (!vista) return;
  const ws = wb.addWorksheet("Cruce por subcuenta");
  ws.columns = [
    { header: "Subcuenta", key: "subcuenta", width: 12 },
    { header: "Concepto contable", key: "etiqueta", width: 36 },
    { header: "Cuenta / concepto", key: "cuenta", width: 16 },
    { header: "Nombre", key: "nombre", width: 40 },
    { header: "Saldo contable", key: "contable", width: 20 },
    { header: "Saldo nómina", key: "modulo", width: 20 },
    { header: "Diferencia", key: "diferencia", width: 18 },
    { header: "Estado", key: "estado", width: 18 },
  ];
  ws.spliceRows(1, 0, [], [], []);
  ws.getCell("A1").value = `${meta.modulo} · ${meta.cliente} · Cruce por subcuenta PUC sumando clases`;
  ws.getCell("A1").font = { bold: true, size: 13 };
  ws.getCell("A2").value = `Corte ${meta.periodo} · v${meta.version} · saldo final del balance`;
  ws.getCell("A2").font = { color: { argb: "FF6B7280" } };
  const HEADER_ROW = 4;
  ws.getRow(HEADER_ROW).font = { bold: true };
  ws.getRow(HEADER_ROW).fill = HEADER_FILL;
  ws.views = [{ state: "frozen", ySplit: HEADER_ROW }];
  const num = ["contable", "modulo", "diferencia"];
  const estado: Record<string, string> = { cuadra: "Cuadra", descuadre: "Diferencia", solo_contable: "Solo contabilidad", solo_modulo: "Solo nómina" };
  for (const f of vista.filas) {
    const fila = ws.addRow({ subcuenta: f.subcuenta, etiqueta: f.etiqueta, contable: f.contable, modulo: f.modulo, diferencia: f.diferencia, estado: estado[f.estado] ?? f.estado });
    fila.font = { bold: true, color: f.estado === "descuadre" ? { argb: "FFB91C1C" } : undefined };
    for (const k of num) fila.getCell(k).numFmt = NUM_FMT;
    for (const c of f.cuentas) {
      const r = ws.addRow({ cuenta: c.cuenta8, nombre: `${c.nombre} (clase ${c.clase})`, contable: c.valor });
      r.getCell("contable").numFmt = NUM_FMT;
      r.outlineLevel = 1;
    }
    for (const c of f.conceptos) {
      const r = ws.addRow({ cuenta: c.codigo + (c.agrupador ? ` · ${c.agrupador}` : ""), nombre: c.descripcion ?? "", modulo: c.total });
      r.getCell("modulo").numFmt = NUM_FMT;
      r.outlineLevel = 1;
    }
  }
  const total = ws.addRow({ subcuenta: "Totales", contable: vista.totales.contable, modulo: vista.totales.modulo, diferencia: vista.totales.diferencia });
  total.font = { bold: true };
  total.fill = TOTAL_FILL;
  for (const k of num) total.getCell(k).numFmt = NUM_FMT;
  if (vista.sinSubcuenta.length > 0) {
    ws.addRow({});
    for (const c of vista.sinSubcuenta) {
      const r = ws.addRow({ etiqueta: "Sin subcuenta conocida", cuenta: c.codigo, nombre: c.descripcion ?? "", modulo: c.total });
      r.getCell("modulo").numFmt = NUM_FMT;
      r.font = { color: { argb: "FF6B7280" } };
    }
  }
}

function hojaControlDeducciones(wb: ExcelJS.Workbook, nomina: CruceNominaExportModulo, meta: MetaExportModulo) {
  const control = nomina.control;
  if (!control || control.filas.length === 0) return;
  const ws = wb.addWorksheet("Control de deducciones");
  ws.columns = [
    { header: "Cuenta del cliente", key: "cuenta", width: 18 },
    { header: "Nombre", key: "nombre", width: 36 },
    { header: "Cuentas del balance", key: "balance", width: 28 },
    { header: "Conceptos", key: "conceptos", width: 44 },
    { header: "Saldo contable", key: "contable", width: 20 },
    { header: "Saldo nómina", key: "modulo", width: 20 },
    { header: "Diferencia", key: "diferencia", width: 18 },
  ];
  ws.spliceRows(1, 0, [], [], []);
  ws.getCell("A1").value = `${meta.modulo} · ${meta.cliente} · Control de deducciones`;
  ws.getCell("A1").font = { bold: true, size: 13 };
  ws.getCell("A2").value = `Corte ${meta.periodo} · v${meta.version} · saldo final del balance · solo informa, no suma al gasto`;
  ws.getCell("A2").font = { color: { argb: "FF6B7280" } };
  const HEADER_ROW = 4;
  ws.getRow(HEADER_ROW).font = { bold: true };
  ws.getRow(HEADER_ROW).fill = HEADER_FILL;
  ws.views = [{ state: "frozen", ySplit: HEADER_ROW }];
  const num = ["contable", "modulo", "diferencia"];
  for (const f of control.filas) {
    const r = ws.addRow({ cuenta: f.cuentaCliente, nombre: f.nombre ?? "", balance: f.cuentasBalance.join(", "), conceptos: f.conceptos.map((c) => `${c.codigo}${c.descripcion ? ` ${c.descripcion}` : ""}`).join(" · "), contable: f.contable, modulo: f.modulo, diferencia: f.diferencia });
    for (const k of num) r.getCell(k).numFmt = NUM_FMT;
    if (!f.cuadra) r.font = { color: { argb: "FFB91C1C" } };
  }
  const total = ws.addRow({ cuenta: "Totales", contable: control.totales.contable, modulo: control.totales.modulo, diferencia: control.totales.diferencia });
  total.font = { bold: true };
  total.fill = TOTAL_FILL;
  for (const k of num) total.getCell(k).numFmt = NUM_FMT;
}

export async function crearExportacionModulo(input: {
  columnas: ColumnaExportModulo[];
  clasificadorEtiqueta: string;
  detalle: FilaExportModulo[];
  consolidado: ConsolidadoExportModulo[];
  /** Solo el borrador: control de subtotales del archivo (si trae alguno). */
  control?: ControlExportModulo[];
  /** Solo el dato cargado de los módulos que cruzan por tercero. */
  cruceTercero?: CruceTerceroExportModulo;
  /** Solo Nómina: vista por subcuenta y control de deducciones. */
  cruceNomina?: CruceNominaExportModulo;
  meta: MetaExportModulo;
}): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Russell Conciliador";
  wb.created = input.meta.generadoEn;
  hojaDetalle(wb, input.columnas, input.clasificadorEtiqueta, input.detalle, input.meta);
  hojaConsolidado(wb, input.clasificadorEtiqueta, input.consolidado, input.meta);
  if (input.control && input.control.length > 0) hojaControlSubtotales(wb, input.clasificadorEtiqueta, input.control, input.meta);
  if (input.cruceTercero) hojaCruceTercero(wb, input.cruceTercero, input.meta);
  if (input.cruceNomina) {
    hojaCruceSubcuenta(wb, input.cruceNomina, input.meta);
    hojaControlDeducciones(wb, input.cruceNomina, input.meta);
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}
