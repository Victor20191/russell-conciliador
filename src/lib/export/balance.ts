// Exportación a Excel del BALANCE OFICIAL, en dos vistas:
//  - "homologado": el balance en el plan estándar Russell, con AGRUPACIONES por
//    nivel (grupo 2 díg → subgrupo 4 díg → cuenta Russell 6 díg), subtotales en
//    NEGRILLA y agrupación colapsable de Excel (outline).
//  - "comparativo": Russell (homologado, negrilla) vs las cuentas del CLIENTE que
//    la componen, también agrupado/colapsable.
import ExcelJS from "exceljs";
import type { NodoBalance, RussellGroup } from "@/lib/balance/calcular";

export type TipoExportBalance = "homologado" | "comparativo";
export type MetaExportBalance = { cliente: string; periodo: string; version: string | number; generadoEn: Date };

const NUM_FMT = "#,##0.00;-#,##0.00";
const HEADER_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEFF1F5" } };
const N1_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFC6D0DE" } };
const N2_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFDDE3EC" } };
const N4_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF0F3F8" } };

// Nombres de CLASE (primer dígito) del PUC colombiano.
const CLASES: Record<string, string> = {
  "1": "Activo", "2": "Pasivo", "3": "Patrimonio", "4": "Ingresos",
  "5": "Gastos", "6": "Costos de ventas", "7": "Costos de producción",
  "8": "Cuentas de orden deudoras", "9": "Cuentas de orden acreedoras",
};

function titulo(ws: ExcelJS.Worksheet, meta: MetaExportBalance, texto: string, cols: number) {
  ws.mergeCells(1, 1, 1, cols);
  ws.getCell("A1").value = `${texto} — ${meta.cliente} · ${meta.periodo} · versión v${meta.version}`;
  ws.getCell("A1").font = { bold: true, size: 12 };
  ws.addRow([]);
}

function encabezados(ws: ExcelJS.Worksheet, cols: string[]) {
  const row = ws.addRow(cols);
  row.font = { bold: true };
  row.eachCell((c) => (c.fill = HEADER_FILL));
}

export type ClaseSubtotal = { clase: string; nombre: string; row: number };

/** Vista HOMOLOGADO: grupo(2) → subgrupo(4) → cuenta Russell(6), con subtotales.
 *  Devuelve la fila (número) del subtotal de cada CLASE para que la hoja de
 *  validación referencie esas celdas con fórmulas. */
function hojaHomologado(wb: ExcelJS.Workbook, arbol: NodoBalance[], meta: MetaExportBalance): ClaseSubtotal[] {
  const ws = wb.addWorksheet("Balance homologado");
  titulo(ws, meta, "Balance homologado (plan Russell)", 12);
  encabezados(ws, ["Clase", "Nombre clase", "Nivel 2", "Nombre nivel 2", "Nivel 4", "Nombre nivel 4", "Cuenta Russell", "Nombre Russell", "Saldo anterior", "Débito", "Crédito", "Saldo actual"]);
  const montos = [9, 10, 11, 12];

  const fila = (cols: (string | number)[], outline: number, opts: { bold?: boolean; fill?: ExcelJS.Fill } = {}): ExcelJS.Row => {
    const row = ws.addRow(cols);
    row.outlineLevel = outline;
    for (const c of montos) row.getCell(c).numFmt = NUM_FMT;
    if (opts.bold) row.font = { bold: true };
    if (opts.fill) row.eachCell((c) => (c.fill = opts.fill!));
    return row;
  };
  const sum = (ns: NodoBalance[], k: "prevBalance" | "debe" | "haber" | "balance") => ns.reduce((a, n) => a + n[k], 0);

  // Agrupa los grupos (nivel 2) por CLASE (primer dígito) para totalizar la clase.
  const porClase = new Map<string, NodoBalance[]>();
  for (const n2 of arbol) {
    const cl = n2.code.charAt(0);
    (porClase.get(cl) ?? porClase.set(cl, []).get(cl)!).push(n2);
  }

  const clases: ClaseSubtotal[] = [];
  for (const [cl, grupos] of porClase) {
    const nom = CLASES[cl] ?? `Clase ${cl}`;
    // Subtotal de CLASE (nivel 1). Se guarda su nº de fila para la hoja de validación.
    const rClase = fila([cl, nom, "", "", "", "", "", "", sum(grupos, "prevBalance"), sum(grupos, "debe"), sum(grupos, "haber"), sum(grupos, "balance")], 0, { bold: true, fill: N1_FILL });
    clases.push({ clase: cl, nombre: nom, row: rClase.number });
    for (const n2 of grupos) {
      fila([cl, nom, n2.code, n2.name, "", "", "", "", n2.prevBalance, n2.debe, n2.haber, n2.balance], 1, { bold: true, fill: N2_FILL });
      for (const n4 of n2.hijos) {
        fila([cl, nom, n2.code, n2.name, n4.code, n4.name, "", "", n4.prevBalance, n4.debe, n4.haber, n4.balance], 2, { bold: true, fill: N4_FILL });
        for (const n6 of n4.hijos) {
          fila([cl, nom, n2.code, n2.name, n4.code, n4.name, n6.code, n6.name, n6.prevBalance, n6.debe, n6.haber, n6.balance], 3);
        }
      }
    }
  }

  [8, 18, 10, 30, 10, 34, 15, 40, 18, 18, 18, 18].forEach((w, i) => (ws.getColumn(i + 1).width = w));
  ws.views = [{ state: "frozen", ySplit: 3 }];
  ws.properties.outlineLevelRow = 3;
  ws.autoFilter = { from: { row: 3, column: 1 }, to: { row: 3, column: 12 } };
  return clases;
}

/** Pestaña VALIDACIÓN: fórmulas VIVAS que referencian los subtotales de clase de la
 *  hoja «Balance homologado» — sumas por clase (ecuación contable = 0), partida doble
 *  (débito = crédito) y control de movimiento (saldo ant. + déb − créd = saldo). Si el
 *  usuario edita el balance, todo recalcula. Signo: débito +, crédito −. */
function hojaValidacion(wb: ExcelJS.Workbook, meta: MetaExportBalance, clases: ClaseSubtotal[]) {
  const ws = wb.addWorksheet("Validación");
  const H = "Balance homologado";
  const ref = (col: string, row: number) => `'${H}'!$${col}$${row}`;
  // Suma (con '+') de una columna sobre los subtotales de clase presentes.
  const sumCol = (col: string) => (clases.length ? clases.map((c) => ref(col, c.row)).join("+") : "0");

  ws.mergeCells(1, 1, 1, 2);
  ws.getCell("A1").value = `Validación del balance — ${meta.cliente} · ${meta.periodo} · versión v${meta.version}`;
  ws.getCell("A1").font = { bold: true, size: 12 };
  ws.getCell("A2").value = "Fórmulas vivas sobre la hoja «Balance homologado» (signo: débito +, crédito −). Si editas el balance, recalculan.";
  ws.getCell("A2").font = { italic: true, size: 9, color: { argb: "FF667085" } };

  const seccion = (txt: string) => {
    const r = ws.addRow([txt, ""]);
    r.font = { bold: true };
    r.eachCell((c) => (c.fill = HEADER_FILL));
    return r.number;
  };
  const kv = (label: string, formula: string, opts: { bold?: boolean } = {}) => {
    const r = ws.addRow([label, { formula }]);
    r.getCell(2).numFmt = NUM_FMT;
    if (opts.bold) r.font = { bold: true };
    return r.number;
  };
  const estado = (label: string, formula: string) => {
    const r = ws.addRow([label, { formula }]);
    r.font = { bold: true };
  };

  ws.addRow([]);
  // A) Sumas por clase — su total debe ser 0 (ecuación contable de la balanza).
  seccion("Sumas por clase (saldo actual, con signo)");
  for (const c of clases) kv(`${c.clase} · ${c.nombre}`, ref("L", c.row));
  const nTotal = kv("Suma de clases (debe ser 0)", sumCol("L"), { bold: true });
  estado("Ecuación contable", `IF(ABS(B${nTotal})<=1,"✓ CUADRA","✗ DESCUADRE "&TEXT(B${nTotal},"#,##0.00"))`);

  ws.addRow([]);
  // B) Partida doble — Σ débito = Σ crédito.
  seccion("Partida doble (movimiento del período)");
  const nDeb = kv("Total débito", sumCol("J"));
  const nCred = kv("Total crédito", sumCol("K"));
  const nDif = kv("Diferencia (débito − crédito)", `B${nDeb}-B${nCred}`, { bold: true });
  estado("Partida doble", `IF(ABS(B${nDif})<=1,"✓ CUADRA","✗ DESCUADRE")`);

  ws.addRow([]);
  // C) Control de movimiento — saldo anterior + débito − crédito = saldo actual.
  seccion("Control de movimiento (saldo ant. + débito − crédito = saldo actual)");
  const nSA = kv("Σ Saldo anterior", sumCol("I"));
  const nD2 = kv("Σ Débito", sumCol("J"));
  const nC2 = kv("Σ Crédito", sumCol("K"));
  const nSF = kv("Σ Saldo actual", sumCol("L"));
  const nCtrl = kv("Control (SA + D − C − Saldo)", `B${nSA}+B${nD2}-B${nC2}-B${nSF}`, { bold: true });
  estado("Estado del control", `IF(ABS(B${nCtrl})<=1,"✓ OK","✗ REVISAR")`);

  ws.getColumn(1).width = 44;
  ws.getColumn(2).width = 26;
  ws.views = [{ state: "frozen", ySplit: 2 }];
}

/** Vista COMPARATIVO: cada cuenta Russell (homologado, negrilla) + sus cuentas del cliente. */
function hojaComparativo(wb: ExcelJS.Workbook, grupos: RussellGroup[], meta: MetaExportBalance) {
  const ws = wb.addWorksheet("Homologado vs Cliente");
  titulo(ws, meta, "Comparativo · Homologado (Russell) vs Cliente", 9);
  encabezados(ws, ["Cuenta Russell", "Nombre Russell", "Cuenta Cliente", "Nombre Cliente", "Saldo anterior", "Débito", "Crédito", "Saldo actual", "Coincidencia"]);
  const montos = [5, 6, 7, 8];

  for (const g of grupos) {
    const gr = ws.addRow([g.code, g.name, "", "", g.prevBalance, g.debe, g.haber, g.balance, ""]);
    gr.outlineLevel = 0;
    gr.font = { bold: true };
    gr.eachCell((c) => (c.fill = N2_FILL));
    for (const c of montos) gr.getCell(c).numFmt = NUM_FMT;
    for (const it of g.items) {
      const cr = ws.addRow(["", "", it.code, it.name, it.prevBalance, it.debe, it.haber, it.balance, it.coincidencia == null ? "" : `${it.coincidencia}%`]);
      cr.outlineLevel = 1;
      for (const c of montos) cr.getCell(c).numFmt = NUM_FMT;
    }
  }

  [15, 40, 15, 40, 18, 18, 18, 18, 12].forEach((w, i) => (ws.getColumn(i + 1).width = w));
  ws.views = [{ state: "frozen", ySplit: 3 }];
  ws.properties.outlineLevelRow = 1;
  ws.autoFilter = { from: { row: 3, column: 1 }, to: { row: 3, column: 9 } };
}

export async function crearExportacionBalance(
  datos: { arbol: NodoBalance[]; grupos: RussellGroup[] },
  meta: MetaExportBalance,
  tipo: TipoExportBalance,
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Russell Conciliador";
  wb.created = meta.generadoEn;
  if (tipo === "comparativo") hojaComparativo(wb, datos.grupos, meta);
  else {
    // Homologado + pestaña de VALIDACIÓN con fórmulas vivas sobre sus subtotales.
    const clases = hojaHomologado(wb, datos.arbol, meta);
    hojaValidacion(wb, meta, clases);
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}
