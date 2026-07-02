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

/** Vista HOMOLOGADO: grupo(2) → subgrupo(4) → cuenta Russell(6), con subtotales. */
function hojaHomologado(wb: ExcelJS.Workbook, arbol: NodoBalance[], meta: MetaExportBalance) {
  const ws = wb.addWorksheet("Balance homologado");
  titulo(ws, meta, "Balance homologado (plan Russell)", 12);
  encabezados(ws, ["Clase", "Nombre clase", "Nivel 2", "Nombre nivel 2", "Nivel 4", "Nombre nivel 4", "Cuenta Russell", "Nombre Russell", "Saldo anterior", "Débito", "Crédito", "Saldo actual"]);
  const montos = [9, 10, 11, 12];

  const fila = (cols: (string | number)[], outline: number, opts: { bold?: boolean; fill?: ExcelJS.Fill } = {}) => {
    const row = ws.addRow(cols);
    row.outlineLevel = outline;
    for (const c of montos) row.getCell(c).numFmt = NUM_FMT;
    if (opts.bold) row.font = { bold: true };
    if (opts.fill) row.eachCell((c) => (c.fill = opts.fill!));
  };
  const sum = (ns: NodoBalance[], k: "prevBalance" | "debe" | "haber" | "balance") => ns.reduce((a, n) => a + n[k], 0);

  // Agrupa los grupos (nivel 2) por CLASE (primer dígito) para totalizar la clase.
  const porClase = new Map<string, NodoBalance[]>();
  for (const n2 of arbol) {
    const cl = n2.code.charAt(0);
    (porClase.get(cl) ?? porClase.set(cl, []).get(cl)!).push(n2);
  }

  for (const [cl, grupos] of porClase) {
    const nom = CLASES[cl] ?? `Clase ${cl}`;
    // Subtotal de CLASE (nivel 1).
    fila([cl, nom, "", "", "", "", "", "", sum(grupos, "prevBalance"), sum(grupos, "debe"), sum(grupos, "haber"), sum(grupos, "balance")], 0, { bold: true, fill: N1_FILL });
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
  else hojaHomologado(wb, datos.arbol, meta);
  return Buffer.from(await wb.xlsx.writeBuffer());
}
