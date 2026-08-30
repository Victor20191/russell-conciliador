// Exportación a Excel de un DATO CARGADO de módulo (Inventarios, Cartera, CxP…):
// lo que se ve en `/modulos/[codigo]/[id]`, en dos hojas:
//  - "Detalle": una fila por ítem con las columnas del descriptor del módulo, agrupadas
//    por clasificador con subtotal en NEGRILLA y agrupación colapsable (outline), y un
//    total general al pie con FÓRMULA VIVA (suma de los subtotales).
//  - "Consolidado": total por clasificador con sus cuentas Russell (4 díg.) asignadas.
// Puro (sin BD): recibe los view-models ya resueltos por el loader RSC.
import ExcelJS from "exceljs";

export type ColumnaExportModulo = { nombre: string; etiqueta: string; tipo: "texto" | "numero" | "moneda" | "fecha" };
/** `estado` (opcional, solo borradores): «Movimiento», «Agrupadora», «OMITIDA»… Si alguna
 *  fila lo trae, se agrega la columna «Estado». `valor` debe venir en 0 para las filas
 *  que NO se consolidan (agrupadoras/omitidas/en cero), así el subtotal iguala la pantalla. */
export type FilaExportModulo = { filaNum: number; clasificador: string | null; valor: number; datos: Record<string, string | number | null>; estado?: string | null };
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
    const d = typeof v === "string" ? new Date(v) : null;
    return d && !Number.isNaN(d.getTime()) ? d : String(v);
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
      const valores: ExcelJS.CellValue[] = [f.filaNum, ...columnas.map((c) => celda(f.datos[c.nombre], c.tipo)), ...(conEstado ? [f.estado ?? null] : []), f.valor];
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
  diferencia: number;
  estado: "cuadra" | "descuadre";
};

function hojaControlSubtotales(wb: ExcelJS.Workbook, clasificadorEtiqueta: string, control: ControlExportModulo[], meta: MetaExportModulo) {
  const ws = wb.addWorksheet("Control subtotales");
  ws.columns = [
    { header: clasificadorEtiqueta, key: "clasificador", width: 34 },
    { header: "Fila subtotal", key: "filaSubtotal", width: 14 },
    { header: "Movimientos", key: "items", width: 13 },
    { header: "Σ movimientos", key: "sumaMovimientos", width: 20 },
    { header: "Subtotal del archivo", key: "subtotalArchivo", width: 20 },
    { header: "Diferencia", key: "diferencia", width: 18 },
    { header: "Estado", key: "estado", width: 12 },
  ];
  ws.spliceRows(1, 0, [], [], []);
  ws.getCell("A1").value = `${meta.modulo} · ${meta.cliente} · Control de subtotales del archivo`;
  ws.getCell("A1").font = { bold: true, size: 13 };
  ws.getCell("A2").value = `Período ${meta.periodo} · v${meta.version} · los subtotales no se cargan: se comparan contra la suma de sus movimientos`;
  ws.getCell("A2").font = { color: { argb: "FF6B7280" } };
  const HEADER_ROW = 4;
  ws.getRow(HEADER_ROW).font = { bold: true };
  ws.getRow(HEADER_ROW).fill = HEADER_FILL;
  ws.views = [{ state: "frozen", ySplit: HEADER_ROW }];
  for (const c of control) {
    const row = ws.addRow({ ...c, estado: c.estado === "cuadra" ? "Cuadra" : "Descuadre" });
    for (const k of ["sumaMovimientos", "subtotalArchivo", "diferencia"]) row.getCell(k).numFmt = NUM_FMT;
    if (c.estado === "descuadre") row.font = { bold: true, color: { argb: "FFB91C1C" } };
  }
}

export async function crearExportacionModulo(input: {
  columnas: ColumnaExportModulo[];
  clasificadorEtiqueta: string;
  detalle: FilaExportModulo[];
  consolidado: ConsolidadoExportModulo[];
  /** Solo el borrador: control de subtotales del archivo (si trae alguno). */
  control?: ControlExportModulo[];
  meta: MetaExportModulo;
}): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Russell Conciliador";
  wb.created = input.meta.generadoEn;
  hojaDetalle(wb, input.columnas, input.clasificadorEtiqueta, input.detalle, input.meta);
  hojaConsolidado(wb, input.clasificadorEtiqueta, input.consolidado, input.meta);
  if (input.control && input.control.length > 0) hojaControlSubtotales(wb, input.clasificadorEtiqueta, input.control, input.meta);
  return Buffer.from(await wb.xlsx.writeBuffer());
}
