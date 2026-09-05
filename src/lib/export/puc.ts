// Generador del Excel de EXPORTACIÓN del plan estándar Russell (botón
// «Exportar a Excel» de /config/mapeo). Función PURA y testeable: recibe las
// filas ya resueltas por la Route Handler y devuelve el Buffer del .xlsx. La
// lectura de BD y el permiso viven en la Route Handler.
//
// Árbol completo 1/2/4/6 y detalle de subcuentas. Los filtros de la pantalla
// no recortan la descarga. El catálogo del cliente es independiente.

import ExcelJS from "exceljs";
import { construirPucRussell, profundidadPuc, type CuentaCuatroPuc, type FilaPucRussell } from "@/lib/balance/puc-estandar";

/** Una cuenta del plan estándar Russell (pestaña «Plan estándar Russell»). */
export type FilaPucEstandar = {
  code: string;
  name: string;
  level: number;
  nature: string;
  parent: string | null;
  critical: boolean;
  russellAccount: string | null;
  categoryType: string | null;
  includes: string | null;
  excludes: string | null;
  possibleAccounts: string | null;
  supportingDocuments: string | null;
  controlSupports: string | null;
  mappingNotes: string | null;
};

export type DatosExportacionPuc = {
  estandar: FilaPucEstandar[];
  subgrupos?: CuentaCuatroPuc[];
};

const HOJA_ESTANDAR = "Plan Estándar";

const COLOR_HEADER = "FF0F2744";
const COLOR_FILL = "FFFFFFFF";
const COLOR_ZEBRA = "FFF6F8FB";
const COLOR_BORDER = "FFD8E0EA";

const BORDE = {
  top: { style: "thin" as const, color: { argb: COLOR_BORDER } },
  left: { style: "thin" as const, color: { argb: COLOR_BORDER } },
  bottom: { style: "thin" as const, color: { argb: COLOR_BORDER } },
  right: { style: "thin" as const, color: { argb: COLOR_BORDER } },
};

function relleno(argb: string): ExcelJS.Fill {
  return { type: "pattern", pattern: "solid", fgColor: { argb } };
}

function columnaLetra(indice: number): string {
  let n = indice;
  let letra = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    letra = String.fromCharCode(65 + r) + letra;
    n = Math.floor((n - 1) / 26);
  }
  return letra;
}

/** Naturaleza del PUC: en BD es D/C; en pantalla y Excel se lee Débito/Crédito. */
export function etiquetaNaturaleza(nature: string): string {
  if (nature === "D") return "Débito";
  if (nature === "C") return "Crédito";
  return nature;
}

type ColumnaHoja<T> = {
  header: string;
  width: number;
  /** Valor de celda. `null`/`undefined` se normalizan a «—» salvo los números. */
  valor: (fila: T) => string | number | null;
  /** Alineación horizontal; por defecto «left». */
  align?: "left" | "center" | "right";
  /** Monoespaciada: códigos e identificadores. */
  mono?: boolean;
  /** Ajuste de texto para columnas largas (notas, incluye/excluye…). */
  wrap?: boolean;
};

/**
 * Pinta una hoja tabular con el estilo común del reporte: encabezado azul,
 * paneles congelados, autofiltro, zebra y bordes. Devuelve la hoja creada.
 */
function agregarHoja<T>(
  wb: ExcelJS.Workbook,
  nombre: string,
  columnas: ColumnaHoja<T>[],
  filas: T[],
  nota?: string,
): ExcelJS.Worksheet {
  const ws = wb.addWorksheet(nombre, {
    views: [{ state: "frozen", ySplit: 1 }],
  });

  ws.addRow(columnas.map((c) => c.header));
  const encabezado = ws.getRow(1);
  encabezado.height = 28;
  columnas.forEach((_, i) => {
    const cell = encabezado.getCell(i + 1);
    cell.font = { color: { argb: "FFFFFFFF" }, bold: true, size: 11 };
    cell.fill = relleno(COLOR_HEADER);
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.border = BORDE;
  });

  filas.forEach((fila) => {
    ws.addRow(
      columnas.map((c) => {
        const v = c.valor(fila);
        if (v == null) return "—";
        return v;
      }),
    );
  });

  columnas.forEach((c, i) => {
    ws.getColumn(i + 1).width = c.width;
  });

  ws.autoFilter = { from: "A1", to: `${columnaLetra(columnas.length)}1` };

  filas.forEach((_, i) => {
    const row = ws.getRow(i + 2); // fila 1 = encabezado
    const fondo = i % 2 === 0 ? COLOR_FILL : COLOR_ZEBRA;
    columnas.forEach((c, j) => {
      const cell = row.getCell(j + 1);
      cell.border = BORDE;
      cell.alignment = {
        vertical: "middle",
        horizontal: c.align ?? "left",
        wrapText: c.wrap ?? false,
      };
      cell.fill = relleno(fondo);
      if (c.mono) cell.font = { name: "Consolas", size: 10.5 };
    });
  });

  if (filas.length === 0 && nota) {
    const row = ws.addRow([nota]);
    row.getCell(1).font = { italic: true, color: { argb: "FF6B7684" } };
    ws.mergeCells(row.number, 1, row.number, Math.max(columnas.length, 1));
  }

  return ws;
}

const COLUMNAS_ESTANDAR: ColumnaHoja<FilaPucEstandar>[] = [
  { header: "Código", width: 14, valor: (f) => f.code, align: "center", mono: true },
  { header: "Nombre", width: 44, valor: (f) => f.name, wrap: true },
  { header: "Nivel", width: 8, valor: (f) => f.level, align: "center" },
  { header: "Naturaleza", width: 14, valor: (f) => etiquetaNaturaleza(f.nature), align: "center" },
  { header: "Cuenta padre", width: 14, valor: (f) => f.parent, align: "center", mono: true },
  { header: "Crítica", width: 10, valor: (f) => (f.critical ? "Sí" : "No"), align: "center" },
  { header: "Cuenta Russell", width: 18, valor: (f) => f.russellAccount, mono: true },
  { header: "Tipo de categoría", width: 22, valor: (f) => f.categoryType },
  { header: "Incluye", width: 46, valor: (f) => f.includes, wrap: true },
  { header: "Excluye", width: 46, valor: (f) => f.excludes, wrap: true },
  { header: "Cuentas posibles", width: 40, valor: (f) => f.possibleAccounts, wrap: true },
  { header: "Documentos soporte", width: 40, valor: (f) => f.supportingDocuments, wrap: true },
  { header: "Soportes de control", width: 40, valor: (f) => f.controlSupports, wrap: true },
  { header: "Notas de mapeo", width: 46, valor: (f) => f.mappingNotes, wrap: true },
];

export async function crearExportacionPuc(
  datos: DatosExportacionPuc,
  generadoEn: Date = new Date(),
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Russell LFM";
  wb.created = generadoEn;

  const arbol = construirPucRussell(datos.estandar, datos.subgrupos ?? []);
  const hojaPuc = agregarHoja<FilaPucRussell>(wb, "PUC Estándar Russell", [
    { header: "Código", width: 16, valor: (f) => f.codigo, mono: true },
    { header: "Nombre", width: 64, valor: (f) => f.nombre },
    { header: "Nivel", width: 10, valor: (f) => f.nivel, align: "center" },
    { header: "Naturaleza", width: 16, valor: (f) => f.naturaleza ? etiquetaNaturaleza(f.naturaleza) : null },
    { header: "Cuenta padre", width: 16, valor: (f) => f.padre, mono: true },
  ], arbol, "El PUC estándar no tiene cuentas cargadas.");
  arbol.forEach((fila, i) => {
    const row = hojaPuc.getRow(i + 2);
    row.outlineLevel = profundidadPuc(fila.nivel);
    row.getCell(1).numFmt = "@";
    row.getCell(2).alignment = { vertical: "middle", indent: profundidadPuc(fila.nivel), wrapText: true };
    if (fila.nivel <= 2) row.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: fila.nivel === 1 ? "FFFFFFFF" : "FF0F2744" } };
      cell.fill = relleno(fila.nivel === 1 ? COLOR_HEADER : "FFE9EFF5");
    });
  });

  agregarHoja(
    wb,
    HOJA_ESTANDAR,
    COLUMNAS_ESTANDAR,
    datos.estandar,
    "El plan estándar no tiene cuentas cargadas.",
  );

  const buffer = await wb.xlsx.writeBuffer();
  return Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer as ArrayBuffer);
}
