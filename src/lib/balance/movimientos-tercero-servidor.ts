import "server-only";
// Lectura EN FLUJO del reporte de movimientos por tercero del ERP (`movimientos-tercero.ts`).
// El de MUMA trae 400 mil filas en 34 MB: se recorre con el lector en flujo de exceljs y se agrega
// por cuenta y tercero sobre la marcha, sin armar la hoja entera en memoria.
import { Readable } from "node:stream";
import ExcelJS from "exceljs";
import {
  agregarFilaMovimiento,
  detectarFilaEncabezado,
  nuevoAgregado,
  sugerirMapeoMovimientos,
  textoCelda,
  type AgregadoMovimientos,
  type MapeoMovimientos,
} from "./movimientos-tercero";

const FILAS_MUESTRA = 8;

function lector(contenido: ArrayBuffer) {
  return new ExcelJS.stream.xlsx.WorkbookReader(Readable.from(Buffer.from(contenido)), {
    sharedStrings: "cache",
    hyperlinks: "ignore",
    styles: "ignore",
    worksheets: "emit",
    entries: "emit",
  });
}

export function esArchivoXlsx(nombre: string): boolean {
  return /\.xlsx$/i.test(nombre.trim());
}

export type VistaPreviaMovimientos = {
  hoja: string;
  filaEncabezado: number;
  encabezados: string[];
  muestra: string[][];
  sugerencia: MapeoMovimientos;
};

/** Encabezados, unas filas de muestra y el mapeo sugerido. Lee solo el inicio de la primera hoja. */
export async function vistaPreviaMovimientos(contenido: ArrayBuffer): Promise<VistaPreviaMovimientos | null> {
  for await (const hoja of lector(contenido)) {
    const filas: string[][] = [];
    for await (const fila of hoja) {
      const valores = (fila.values as unknown[]) ?? [];
      const textos: string[] = [];
      for (let c = 1; c < valores.length; c++) textos[c - 1] = textoCelda(valores[c]);
      filas[fila.number - 1] = textos;
      if (fila.number >= 20 + FILAS_MUESTRA) break;
    }
    const densas = Array.from({ length: filas.length }, (_, i) => filas[i] ?? []);
    const filaEncabezado = detectarFilaEncabezado(densas);
    const encabezados = densas[filaEncabezado - 1] ?? [];
    const muestra = densas.slice(filaEncabezado, filaEncabezado + FILAS_MUESTRA);
    const nombre = (hoja as unknown as { name?: string }).name ?? "Hoja 1";
    return { hoja: nombre, filaEncabezado, encabezados, muestra, sugerencia: sugerirMapeoMovimientos(encabezados, filaEncabezado) };
  }
  return null;
}

/** Recorre la primera hoja completa y la agrega por cuenta y tercero con el mapeo dado. */
export async function agregarArchivoMovimientos(contenido: ArrayBuffer, mapeo: MapeoMovimientos): Promise<AgregadoMovimientos> {
  const agregado = nuevoAgregado();
  for await (const hoja of lector(contenido)) {
    for await (const fila of hoja) {
      if (fila.number <= mapeo.filaEncabezado) continue;
      agregarFilaMovimiento(agregado, (fila.values as unknown[]) ?? [], mapeo, fila.number);
    }
    break;
  }
  return agregado;
}
