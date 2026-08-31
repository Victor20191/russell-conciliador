// Inspección de hojas en el CLIENTE para que el staff elija cuál cargar.
//
// Cuando un Excel trae varias hojas (Balance, Retenciones, Parámetros…), el
// usuario debe elegir explícitamente la hoja del balance: la IA no asume. Este
// módulo lee el libro en el navegador —ExcelJS para .xlsx/.xlsm y SheetJS para
// .xls, igual que la ingesta del servidor— para listar las hojas con contenido
// y una vista previa, SIN subir el archivo.

import type ExcelJS from "exceljs";

export type CeldaCruda = string | number | boolean | null;

export type HojaPreview = {
  nombre: string;
  totalFilas: number;
  totalColumnas: number;
  muestra: CeldaCruda[][];
  /** El archivo es grande y solo se leyó el índice de hojas, no sus celdas. */
  vistaPreviaOmitida?: boolean;
};

const MAX_FILAS_MUESTRA = 10;
const MAX_COLS_MUESTRA = 8;
const MAX_PREVIEW_HOJAS_BYTES = 500 * 1024;

/**
 * Un xlsx comprime varias veces su contenido. Por encima de 500 KiB, cargar
 * todas las celdas con ExcelJS puede congelar la interfaz; basta leer el índice.
 */
export function debeLeerSoloNombresHojas(tamanoBytes: number): boolean {
  return tamanoBytes > MAX_PREVIEW_HOJAS_BYTES;
}

/**
 * Lee un Excel (.xlsx/.xlsm/.xls) en el navegador y devuelve sus hojas CON
 * contenido (descarta las vacías) y una vista previa (primeras filas × columnas).
 * Usa las mismas opciones de lectura que el servidor para que los nombres de
 * hoja y los conteos coincidan 1:1 con lo que procesará el backend. Lanza si el
 * archivo es ilegible (el llamador lo trata como «sin hojas» y sigue el flujo
 * normal donde la IA elige).
 */
export async function leerHojasParaPreview(file: File): Promise<HojaPreview[]> {
  if (/\.xls$/i.test(file.name)) return leerHojasXls(file);
  return leerHojasExcelModerno(file);
}

/**
 * Lee únicamente el índice del libro para que un Excel grande también obligue a
 * escoger la hoja ANTES de subirlo. `bookSheets` evita descomprimir y convertir
 * todas las celdas en el hilo principal; la lectura completa queda en el servidor.
 */
export async function leerNombresHojas(file: File): Promise<HojaPreview[]> {
  const XLSX = await import("xlsx");
  const wb = XLSX.read(new Uint8Array(await file.arrayBuffer()), {
    type: "array",
    bookSheets: true,
  });

  return wb.SheetNames.map((nombre) => ({
    nombre,
    totalFilas: 0,
    totalColumnas: 0,
    muestra: [],
    vistaPreviaOmitida: true,
  }));
}

async function leerHojasExcelModerno(file: File): Promise<HojaPreview[]> {
  const { default: ExcelJSRuntime } = await import("exceljs");
  const wb = new ExcelJSRuntime.Workbook();
  const data = (await file.arrayBuffer()) as Parameters<typeof wb.xlsx.load>[0];
  await wb.xlsx.load(data);

  const hojas: HojaPreview[] = [];
  for (const ws of wb.worksheets) {
    const filas: CeldaCruda[][] = [];
    ws.eachRow({ includeEmpty: false }, (row) => {
      const values = (row.values as ExcelJS.CellValue[]).slice(1).map(celdaExcel);
      if (filaTieneDatos(values)) filas.push(values);
    });
    if (filas.length === 0) continue; // hoja vacía: no se ofrece para elegir
    const totalColumnas = filas.reduce((max, f) => Math.max(max, f.length), 0);
    const muestra = filas.slice(0, MAX_FILAS_MUESTRA).map((f) => f.slice(0, MAX_COLS_MUESTRA));
    hojas.push({ nombre: ws.name, totalFilas: filas.length, totalColumnas, muestra });
  }
  return hojas;
}

async function leerHojasXls(file: File): Promise<HojaPreview[]> {
  const XLSX = await import("xlsx");
  const wb = XLSX.read(new Uint8Array(await file.arrayBuffer()), {
    type: "array",
    raw: true,
    dense: true,
    sheetRows: 65_536,
    cellDates: false,
    cellFormula: false,
    cellHTML: false,
    bookVBA: false,
  });

  const hojas: HojaPreview[] = [];
  for (const nombre of wb.SheetNames) {
    const ws = wb.Sheets[nombre];
    if (!ws) continue;
    const filas = XLSX.utils
      .sheet_to_json<unknown[]>(ws, {
        header: 1,
        raw: true,
        defval: null,
        blankrows: false,
      })
      .map((fila) => fila.map(celdaXls))
      .filter(filaTieneDatos);
    if (filas.length === 0) continue;
    hojas.push(crearPreview(nombre, filas));
  }
  return hojas;
}

function crearPreview(nombre: string, filas: CeldaCruda[][]): HojaPreview {
  const totalColumnas = filas.reduce((max, fila) => Math.max(max, fila.length), 0);
  const muestra = filas.slice(0, MAX_FILAS_MUESTRA).map((fila) => fila.slice(0, MAX_COLS_MUESTRA));
  return { nombre, totalFilas: filas.length, totalColumnas, muestra };
}

function celdaExcel(v: ExcelJS.CellValue): CeldaCruda {
  if (v == null) return null;
  if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") return v;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "object") {
    if ("result" in v) return celdaExcel(v.result as ExcelJS.CellValue);
    if ("text" in v && typeof v.text === "string") return v.text;
    if ("richText" in v && Array.isArray(v.richText)) {
      return v.richText.map((r) => r.text ?? "").join("");
    }
    return JSON.stringify(v);
  }
  return String(v);
}

function celdaXls(v: unknown): CeldaCruda {
  if (v == null) return null;
  if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") return v;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v);
}

function filaTieneDatos(fila: CeldaCruda[]): boolean {
  return fila.some((c) => c != null && String(c).trim() !== "");
}

/** Índice de columna 0-based → letra estilo Excel (0→A, 25→Z, 26→AA). */
export function columnaLetra(indice: number): string {
  let s = "";
  let n = indice;
  do {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return s;
}
