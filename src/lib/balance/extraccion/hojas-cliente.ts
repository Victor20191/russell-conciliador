// Inspección de hojas en el CLIENTE para que el staff elija cuál cargar.
//
// Cuando un Excel trae varias hojas (Balance, Retenciones, Parámetros…), el
// usuario debe elegir explícitamente la hoja del balance: la IA no asume. Este
// módulo lee el libro OOXML moderno en el navegador —con la misma librería que
// la ingesta del servidor— para listar las hojas con contenido y una vista
// previa, SIN subir el archivo.

import type ExcelJS from "exceljs";

export type CeldaCruda = string | number | boolean | null;

export type HojaPreview = {
  nombre: string;
  totalFilas: number;
  totalColumnas: number;
  muestra: CeldaCruda[][];
};

const MAX_FILAS_MUESTRA = 10;
const MAX_COLS_MUESTRA = 8;

/**
 * Lee un Excel (.xlsx/.xlsm) en el navegador y devuelve sus hojas CON
 * contenido (descarta las vacías) y una vista previa (primeras filas × columnas).
 * Usa las mismas opciones de lectura que el servidor para que los nombres de
 * hoja y los conteos coincidan 1:1 con lo que procesará el backend. Lanza si el
 * archivo es ilegible (el llamador lo trata como «sin hojas» y sigue el flujo
 * normal donde la IA elige).
 */
export async function leerHojasParaPreview(file: File): Promise<HojaPreview[]> {
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
