// Exportación a Excel del BALANCE OFICIAL, en dos vistas:
//  - "homologado": el balance en el plan estándar Russell. El código y la descripción
//    de la cuenta van en columnas separadas; el nivel PUC también va separado en número
//    y descripción (1=Clase, 2=Grupo, 3=Cuenta, 4=Subcuenta, 5=Auxiliar). Jerarquía
//    Clase → Grupo → Cuenta → Subcuenta con subtotales en NEGRILLA y agrupación
//    colapsable (outline).
//  - "comparativo": Russell (homologado, negrilla) vs las cuentas del CLIENTE que
//    la componen, también agrupado/colapsable.
import ExcelJS from "exceljs";
import type { NodoBalance, RussellGroup } from "@/lib/balance/calcular";
import type { PrevalidadorVM } from "@/lib/balance/prevalidador/calcular";

export type TipoExportBalance = "homologado" | "comparativo" | "prevalidador";
export type MetaExportBalance = { cliente: string; periodo: string; version: string | number; generadoEn: Date };
export type RevisionPrevalidadorExport = {
  estado: "pendiente" | "aprobada" | "revocada" | "desactualizada";
  vigente: boolean;
  justificacion: string | null;
  actor: string | null;
  creadoEn: string | null;
  huella: string | null;
};

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

// Nivel PUC según la longitud del código: 1=Clase, 2=Grupo, 3=Cuenta,
// 4=Subcuenta, 5=Auxiliar.
const nivelPUC = (code: string): { numero: number; descripcion: string } => {
  const n = code.length;
  if (n <= 1) return { numero: 1, descripcion: "Clase" };
  if (n <= 2) return { numero: 2, descripcion: "Grupo" };
  if (n <= 4) return { numero: 3, descripcion: "Cuenta" };
  if (n <= 6) return { numero: 4, descripcion: "Subcuenta" };
  return { numero: 5, descripcion: "Auxiliar" };
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
  titulo(ws, meta, "Balance homologado (plan Russell)", 8);
  encabezados(ws, ["Número de nivel", "Descripción del nivel", "Código de cuenta", "Descripción de la cuenta", "Saldo anterior", "Débito", "Crédito", "Saldo actual"]);
  const montos = [5, 6, 7, 8];

  // `outline` da el nivel colapsable de Excel Y la indentación visual de la descripción.
  const fila = (code: string, descripcionCuenta: string, m: number[], outline: number, opts: { bold?: boolean; fill?: ExcelJS.Fill } = {}): ExcelJS.Row => {
    const nivel = nivelPUC(code);
    const row = ws.addRow([nivel.numero, nivel.descripcion, code, descripcionCuenta, ...m]);
    row.outlineLevel = outline;
    row.getCell(3).numFmt = "@"; // conserva el código como identificador de texto
    for (const c of montos) row.getCell(c).numFmt = NUM_FMT;
    row.getCell(4).alignment = { indent: outline }; // anida visualmente la descripción
    if (opts.bold) row.font = { bold: true };
    if (opts.fill) row.eachCell((c) => (c.fill = opts.fill!));
    return row;
  };
  const sum = (ns: NodoBalance[], k: "prevBalance" | "debe" | "haber" | "balance") => ns.reduce((a, n) => a + n[k], 0);

  // Agrupa los grupos (2 díg) por CLASE (primer dígito) para totalizar la clase.
  const porClase = new Map<string, NodoBalance[]>();
  for (const n2 of arbol) {
    const cl = n2.code.charAt(0);
    (porClase.get(cl) ?? porClase.set(cl, []).get(cl)!).push(n2);
  }

  const clases: ClaseSubtotal[] = [];
  for (const [cl, grupos] of porClase) {
    const nom = CLASES[cl] ?? `Clase ${cl}`;
    // Subtotal de CLASE. Se guarda su nº de fila para la hoja de validación.
    const rClase = fila(cl, nom, [sum(grupos, "prevBalance"), sum(grupos, "debe"), sum(grupos, "haber"), sum(grupos, "balance")], 0, { bold: true, fill: N1_FILL });
    clases.push({ clase: cl, nombre: nom, row: rClase.number });
    for (const n2 of grupos) {
      fila(n2.code, n2.name, [n2.prevBalance, n2.debe, n2.haber, n2.balance], 1, { bold: true, fill: N2_FILL });
      for (const n4 of n2.hijos) {
        fila(n4.code, n4.name, [n4.prevBalance, n4.debe, n4.haber, n4.balance], 2, { bold: true, fill: N4_FILL });
        for (const n6 of n4.hijos) {
          fila(n6.code, n6.name, [n6.prevBalance, n6.debe, n6.haber, n6.balance], 3);
        }
      }
    }
  }

  [17, 21, 18, 42, 18, 18, 18, 18].forEach((w, i) => (ws.getColumn(i + 1).width = w));
  ws.views = [{ state: "frozen", ySplit: 3 }];
  ws.properties.outlineLevelRow = 3;
  ws.autoFilter = { from: { row: 3, column: 1 }, to: { row: 3, column: 8 } };
  ws.pageSetup = {
    orientation: "landscape",
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    horizontalCentered: true,
    printArea: `A1:H${ws.rowCount}`,
    printTitlesRow: "1:3",
  };
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
  //    Montos en «Balance homologado»: saldo ant. E, débito F, crédito G, saldo actual H.
  seccion("Sumas por clase (saldo actual, con signo)");
  for (const c of clases) kv(`${c.clase} · ${c.nombre}`, ref("H", c.row));
  const nTotal = kv("Suma de clases (debe ser 0)", sumCol("H"), { bold: true });
  estado("Ecuación contable", `IF(ABS(B${nTotal})<=1,"✓ CUADRA","✗ DESCUADRE "&TEXT(B${nTotal},"#,##0.00"))`);

  ws.addRow([]);
  // B) Partida doble — Σ débito = Σ crédito.
  seccion("Partida doble (movimiento del período)");
  const nDeb = kv("Total débito", sumCol("F"));
  const nCred = kv("Total crédito", sumCol("G"));
  const nDif = kv("Diferencia (débito − crédito)", `B${nDeb}-B${nCred}`, { bold: true });
  estado("Partida doble", `IF(ABS(B${nDif})<=1,"✓ CUADRA","✗ DESCUADRE")`);

  ws.addRow([]);
  // C) Control de movimiento — saldo anterior + débito − crédito = saldo actual.
  seccion("Control de movimiento (saldo ant. + débito − crédito = saldo actual)");
  const nSA = kv("Σ Saldo anterior", sumCol("E"));
  const nD2 = kv("Σ Débito", sumCol("F"));
  const nC2 = kv("Σ Crédito", sumCol("G"));
  const nSF = kv("Σ Saldo actual", sumCol("H"));
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

/** Vista PREVALIDADOR: consume el VM ya calculado por el dominio. No vuelve a
 * sumar ni resta saldos, de modo que pantalla, compuerta y archivo comparten el
 * mismo signo, exclusiones y tratamiento de cuentas ausentes. */
function hojaPrevalidador(wb: ExcelJS.Workbook, prevalidador: PrevalidadorVM, meta: MetaExportBalance) {
  if (prevalidador.estado !== "listo") {
    throw new Error("El prevalidador no está disponible para exportar.");
  }

  const ws = wb.addWorksheet("Prevalidador");
  titulo(ws, meta, "Prevalidador de homologación", 11);
  encabezados(ws, [
    "Módulo",
    "Cuenta Russell",
    "Base de cálculo",
    "Valor Russell",
    "Cuenta cliente",
    "Valor cliente",
    "Diferencia cliente − Russell",
    "Total Russell del módulo",
    "Total cliente del módulo",
    "Diferencia del módulo",
    "Estado",
  ]);

  for (const modulo of prevalidador.modulos) {
    modulo.filas.forEach((fila, indice) => {
      const encontrada = fila.russell.encontrada && fila.cliente.encontrada;
      const row = ws.addRow([
        modulo.nombre,
        fila.cuentaRussell,
        fila.baseCalculo === "movimiento" ? "Débitos − créditos" : "Saldo final",
        fila.russell.encontrada ? fila.russell.saldoFinal : "Cuenta no encontrada",
        fila.cuentaCliente,
        fila.cliente.encontrada ? fila.cliente.saldoFinal : "Cuenta no encontrada",
        encontrada ? fila.diferencia : "No calculable",
        indice === 0 ? modulo.totalRussell : "",
        indice === 0 ? modulo.totalCliente : "",
        indice === 0 && modulo.filas.every((f) => f.russell.encontrada && f.cliente.encontrada)
          ? modulo.diferenciaTotal
          : indice === 0
            ? "No calculable"
            : "",
        !encontrada ? "Cuenta no encontrada" : fila.coincide ? "OK" : "Con diferencia",
      ]);
      row.getCell(2).numFmt = "@";
      row.getCell(5).numFmt = "@";
      for (const columna of [4, 6, 7, 8, 9, 10]) {
        if (typeof row.getCell(columna).value === "number") row.getCell(columna).numFmt = NUM_FMT;
      }
      if (indice === 0) {
        row.getCell(1).font = { bold: true };
        for (const columna of [8, 9, 10]) row.getCell(columna).font = { bold: true };
      }
    });
  }

  if (prevalidador.anidamientos.length > 0) {
    ws.addRow([]);
    const aviso = ws.addRow([
      "Agrupadoras excluidas para evitar doble conteo",
      prevalidador.anidamientos.map((a) => a.cuenta8).join(", "),
    ]);
    aviso.font = { italic: true, color: { argb: "FF667085" } };
  }

  [24, 16, 22, 18, 16, 18, 24, 22, 22, 22, 22].forEach((w, i) => (ws.getColumn(i + 1).width = w));
  ws.views = [{ state: "frozen", ySplit: 3 }];
  ws.autoFilter = { from: { row: 3, column: 1 }, to: { row: 3, column: 11 } };
  ws.pageSetup = {
    orientation: "landscape",
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    printTitlesRow: "1:3",
  };
}

/** Deja claro si el archivo es evidencia aprobada o un cálculo de trabajo. */
function hojaTrazabilidadPrevalidador(
  wb: ExcelJS.Workbook,
  revision: RevisionPrevalidadorExport | undefined,
  meta: MetaExportBalance,
) {
  const ws = wb.addWorksheet("Trazabilidad prevalidador");
  ws.mergeCells("A1:B1");
  ws.getCell("A1").value = `Trazabilidad del prevalidador — ${meta.cliente} · ${meta.periodo} · versión v${meta.version}`;
  ws.getCell("A1").font = { bold: true, size: 12 };
  ws.addRow([]);
  const estado = revision?.vigente ? "APROBADO Y VIGENTE" : `NO APROBADO · ${revision?.estado ?? "sin revisión"}`;
  const filas: Array<[string, string]> = [
    ["Estado", estado],
    ["Válido para habilitar conciliación", revision?.vigente ? "Sí" : "No"],
    ["Revisor", revision?.actor ?? "—"],
    ["Fecha de revisión", revision?.creadoEn ?? "—"],
    ["Justificación", revision?.justificacion ?? "—"],
    ["Huella SHA-256", revision?.huella ?? "—"],
  ];
  for (const [etiqueta, valor] of filas) {
    const row = ws.addRow([etiqueta, valor]);
    row.getCell(1).font = { bold: true };
  }
  ws.getColumn(1).width = 34;
  ws.getColumn(2).width = 90;
  ws.getCell("B3").font = {
    bold: true,
    color: { argb: revision?.vigente ? "FF18794E" : "FFB42318" },
  };
}

export async function crearExportacionBalance(
  datos: {
    arbol: NodoBalance[];
    grupos: RussellGroup[];
    prevalidador?: PrevalidadorVM;
    revisionPrevalidador?: RevisionPrevalidadorExport;
  },
  meta: MetaExportBalance,
  tipo: TipoExportBalance,
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Russell Conciliador";
  wb.created = meta.generadoEn;
  if (tipo === "comparativo") hojaComparativo(wb, datos.grupos, meta);
  else if (tipo === "prevalidador") {
    if (!datos.prevalidador) throw new Error("Faltan los datos del prevalidador.");
    hojaPrevalidador(wb, datos.prevalidador, meta);
    hojaTrazabilidadPrevalidador(wb, datos.revisionPrevalidador, meta);
  } else {
    // Homologado + pestaña de VALIDACIÓN con fórmulas vivas sobre sus subtotales.
    const clases = hojaHomologado(wb, datos.arbol, meta);
    hojaValidacion(wb, meta, clases);
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}
