// Generador del Excel de EXPORTACIÓN de los PUC de la plataforma (botón
// «Exportar a Excel» de /config/mapeo). Función PURA y testeable: recibe las
// filas ya resueltas por la Route Handler y devuelve el Buffer del .xlsx. La
// lectura de BD, el permiso y el alcance por cartera viven en la Route Handler.
//
// El libro reproduce las cuatro pestañas de la pantalla, una por hoja, en el
// mismo orden en que se ven, más una hoja «Resumen» al frente con los conteos:
//   Plan estándar · PUC cliente · Mapeo cliente · Subgrupos
//
// El contenido es SIEMPRE el catálogo completo: los filtros y la búsqueda de la
// pantalla no recortan la descarga.

import ExcelJS from "exceljs";
import { fmtDate } from "@/lib/format";

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

/** Una cuenta del PUC del cliente seleccionado (pestaña «Mapeo por cliente»). */
export type FilaPucCliente = {
  code: string;
  name: string;
  level: number;
  cuenta6Russell: string | null;
  nombreRussell: string | null;
  coincidencia: number | null;
  origenMapeo: string | null;
};

/** Una regla de la memoria de mapeo (pestaña «Mapeo balance/cliente»). */
export type FilaMapeoCliente = {
  cuenta6: string;
  nombreCuenta: string;
  nivel: number;
  cuenta6Russell: string;
  nombreRussell: string | null;
  coincidencia: number | null;
  origen: string | null; // manual | manual_cuenta | automatico · null = sin asignar
  actualizadoPor: string | null;
  actualizadoEn: string | null; // ISO
};

/** Un subgrupo de nivel 4 (pestaña «Subgrupos (nivel 4)»). */
export type FilaSubgrupo = {
  codigo: string;
  nombre: string;
  grupo: string;
  nombreGrupo: string;
  naturaleza: string;
};

export type DatosExportacionPuc = {
  /** Cliente cuyo PUC y memoria de mapeo se exportan (null = no había ninguno). */
  cliente: string | null;
  clienteNit: string | null;
  estandar: FilaPucEstandar[];
  pucCliente: FilaPucCliente[];
  mapeoCliente: FilaMapeoCliente[];
  subgrupos: FilaSubgrupo[];
};

const HOJA_RESUMEN = "Resumen";
const HOJA_ESTANDAR = "Plan estándar";
const HOJA_PUC_CLIENTE = "PUC cliente";
const HOJA_MAPEO = "Mapeo cliente";
const HOJA_SUBGRUPOS = "Subgrupos";

const COLOR_HEADER = "FF0F2744";
const COLOR_FILL = "FFFFFFFF";
const COLOR_ZEBRA = "FFF6F8FB";
const COLOR_BORDER = "FFD8E0EA";
const COLOR_MANUAL = "FFE3F4E9"; // verde suave — regla fijada a mano
const COLOR_AUTO = "FFF1F3F6"; // gris — dedujo la cascada
const COLOR_SIN = "FFFFF4D6"; // ámbar — sin homologar

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

/** Etiqueta legible del `origen_mapeo` de `cuentas_cliente`, igual que la UI. */
export function etiquetaOrigen(origen: string | null): { label: string; color: string } {
  if (origen === "manual") return { label: "Manual (grupo)", color: COLOR_MANUAL };
  if (origen === "manual_cuenta") return { label: "Manual (solo esta cuenta)", color: COLOR_MANUAL };
  if (origen === "automatico") return { label: "Automático", color: COLOR_AUTO };
  return { label: "Sin asignar", color: COLOR_SIN };
}

/** Texto de la fecha ISO de la memoria; vacío si la fila nunca se tocó. */
function fechaTexto(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : fmtDate(d);
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
  /** Color de relleno por fila (estados); si falta, se usa la zebra. */
  fill?: (fila: T) => string;
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

  filas.forEach((fila, i) => {
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
      cell.fill = relleno(c.fill ? c.fill(fila) : fondo);
      if (c.mono) cell.font = { name: "Consolas", size: 10.5 };
    });
  });

  // Cuando no hay nada que listar la hoja igual existe (el libro conserva sus
  // cuatro pestañas): se deja una línea que explica por qué está vacía.
  if (filas.length === 0 && nota) {
    const row = ws.addRow([nota]);
    row.getCell(1).font = { italic: true, color: { argb: "FF6B7684" } };
    ws.mergeCells(row.number, 1, row.number, Math.max(columnas.length, 1));
  }

  return ws;
}

function agregarResumen(wb: ExcelJS.Workbook, datos: DatosExportacionPuc, generadoEn: Date) {
  const ws = wb.addWorksheet(HOJA_RESUMEN);
  ws.columns = [{ width: 40 }, { width: 26 }];

  const manuales = datos.mapeoCliente.filter(
    (m) => m.origen === "manual" || m.origen === "manual_cuenta",
  ).length;
  const homologadas = datos.pucCliente.filter((c) => !!c.cuenta6Russell).length;

  const filas: [string, string | number][] = [
    ["Reporte", "PUC de la plataforma"],
    ["Generado el", fmtDate(generadoEn)],
    ["Cliente", datos.cliente ?? "Sin cliente seleccionado"],
    ["NIT", datos.clienteNit ?? "—"],
    ["", ""],
    ["Contenido del libro", ""],
    ["  Plan estándar Russell (cuentas)", datos.estandar.length],
    ["  PUC del cliente (cuentas)", datos.pucCliente.length],
    ["  · homologadas a cuenta Russell", homologadas],
    ["  Memoria de mapeo (reglas)", datos.mapeoCliente.length],
    ["  · fijadas a mano", manuales],
    ["  Subgrupos nivel 4", datos.subgrupos.length],
  ];

  filas.forEach(([etiqueta, valor], i) => {
    const row = ws.addRow([etiqueta, valor]);
    const esTitulo = i === 0 || etiqueta === "Contenido del libro";
    row.getCell(1).font = {
      bold: esTitulo,
      color: esTitulo ? { argb: COLOR_HEADER } : undefined,
    };
    row.getCell(2).alignment = { horizontal: "right" };
  });
}

const COLUMNAS_ESTANDAR: ColumnaHoja<FilaPucEstandar>[] = [
  { header: "Código", width: 14, valor: (f) => f.code, align: "center", mono: true },
  { header: "Nombre", width: 44, valor: (f) => f.name, wrap: true },
  { header: "Nivel", width: 8, valor: (f) => f.level, align: "center" },
  { header: "Naturaleza", width: 14, valor: (f) => f.nature, align: "center" },
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

const COLUMNAS_PUC_CLIENTE: ColumnaHoja<FilaPucCliente>[] = [
  { header: "Cuenta cliente", width: 16, valor: (f) => f.code, align: "center", mono: true },
  { header: "Nombre", width: 46, valor: (f) => f.name, wrap: true },
  { header: "Nivel", width: 8, valor: (f) => f.level, align: "center" },
  { header: "Cuenta Russell", width: 16, valor: (f) => f.cuenta6Russell, align: "center", mono: true },
  { header: "Nombre cuenta Russell", width: 44, valor: (f) => f.nombreRussell, wrap: true },
  { header: "Coincidencia (%)", width: 16, valor: (f) => f.coincidencia, align: "center" },
  {
    header: "Origen del mapeo",
    width: 24,
    valor: (f) => etiquetaOrigen(f.origenMapeo).label,
    align: "center",
    fill: (f) => etiquetaOrigen(f.origenMapeo).color,
  },
];

const COLUMNAS_MAPEO: ColumnaHoja<FilaMapeoCliente>[] = [
  { header: "Cuenta cliente", width: 16, valor: (f) => f.cuenta6, align: "center", mono: true },
  { header: "Nombre", width: 46, valor: (f) => f.nombreCuenta, wrap: true },
  { header: "Nivel", width: 8, valor: (f) => f.nivel, align: "center" },
  { header: "Cuenta Russell", width: 16, valor: (f) => f.cuenta6Russell || null, align: "center", mono: true },
  { header: "Nombre cuenta Russell", width: 44, valor: (f) => f.nombreRussell, wrap: true },
  { header: "Coincidencia (%)", width: 16, valor: (f) => f.coincidencia, align: "center" },
  {
    header: "Alcance de la regla",
    width: 24,
    valor: (f) => etiquetaOrigen(f.origen).label,
    align: "center",
    fill: (f) => etiquetaOrigen(f.origen).color,
  },
  { header: "Actualizado por", width: 24, valor: (f) => f.actualizadoPor },
  { header: "Actualizado el", width: 16, valor: (f) => fechaTexto(f.actualizadoEn), align: "center" },
];

const COLUMNAS_SUBGRUPOS: ColumnaHoja<FilaSubgrupo>[] = [
  { header: "Código", width: 12, valor: (f) => f.codigo, align: "center", mono: true },
  { header: "Nombre del subgrupo", width: 46, valor: (f) => f.nombre, wrap: true },
  { header: "Grupo", width: 12, valor: (f) => f.grupo, align: "center", mono: true },
  { header: "Nombre del grupo", width: 40, valor: (f) => f.nombreGrupo, wrap: true },
  { header: "Naturaleza", width: 14, valor: (f) => f.naturaleza, align: "center" },
];

export async function crearExportacionPuc(
  datos: DatosExportacionPuc,
  generadoEn: Date = new Date(),
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Russell LFM";
  wb.created = generadoEn;

  agregarResumen(wb, datos, generadoEn);
  agregarHoja(wb, HOJA_ESTANDAR, COLUMNAS_ESTANDAR, datos.estandar, "El plan estándar no tiene cuentas cargadas.");
  agregarHoja(
    wb,
    HOJA_PUC_CLIENTE,
    COLUMNAS_PUC_CLIENTE,
    datos.pucCliente,
    datos.cliente
      ? `${datos.cliente} todavía no tiene cuentas cargadas.`
      : "No hay un cliente con balances en tu cartera, así que no hay PUC de cliente que exportar.",
  );
  agregarHoja(
    wb,
    HOJA_MAPEO,
    COLUMNAS_MAPEO,
    datos.mapeoCliente,
    datos.cliente
      ? `${datos.cliente} todavía no tiene reglas de mapeo memorizadas.`
      : "No hay un cliente con balances en tu cartera, así que no hay memoria de mapeo que exportar.",
  );
  agregarHoja(wb, HOJA_SUBGRUPOS, COLUMNAS_SUBGRUPOS, datos.subgrupos, "No hay subgrupos de nivel 4 definidos.");

  const buffer = await wb.xlsx.writeBuffer();
  return Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer as ArrayBuffer);
}
