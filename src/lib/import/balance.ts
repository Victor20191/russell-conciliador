// Parser del Excel de balance de comprobación (`Plantilla_Balance_Comprobacion.xlsx`).
// Lee la hoja «Balance» (encabezados en la fila 1, datos desde la fila 2) y
// devuelve las cuentas crudas + errores de estructura. El cálculo de agregados
// (mapeo, sumas, validaciones) vive en `src/lib/balance/calcular.ts` y la
// persistencia/versionado en la Server Action `confirmarCargaBalance`.

import type ExcelJS from "exceljs";
import { celdaTexto, normalizar, cargarWorkbook } from "./xlsx";
import type { ErrorImport } from "./maestros";
import type { Excepcion, ResumenAuditoria } from "@/lib/balance/extraccion/esquema";
import { ingerir, type GridHoja } from "@/lib/balance/extraccion/ingesta";

const HOJA = "Balance";

export type FilaBalance = { fila: number; code: string; name: string; prevBalance: number; balance: number };
export type ParseBalance = { filas: FilaBalance[]; errores: ErrorImport[] };
export type OpcionesParseBalance = { archivoNombre?: string; hoja?: string | null };

type HojaBalance = {
  nombre: string;
  totalFilas: number;
  valoresFila: (fila: number) => unknown[];
  valorCelda: (fila: number, columna: number) => unknown;
};

/** Estado que devuelven las Server Actions de carga de balance (resultado o errores). */
export type ImportBalanceState = {
  ok?: boolean;
  message?: string;
  errores?: ErrorImport[]; // errores de parseo (respaldo plantilla limpia)
  excepciones?: Excepcion[]; // excepciones del ETL asistido por IA (SALIDA B)
  resumen?: {
    id: number;
    cliente: string;
    period: string;
    version: string;
    cuentas: number;
    mapped: number;
    unmapped: number;
    balanced: boolean;
    auditoria?: ResumenAuditoria; // RESUMEN_AUDITORIA (SALIDA C)
  };
};

/**
 * Convierte un monto en formato es-CO a número. Acepta separador de miles «.»
 * y decimal «,», paréntesis o «-» para negativos y el símbolo «$». Devuelve 0
 * para celdas vacías y null si el texto no es un número reconocible.
 */
export function parseMonto(raw: string): number | null {
  const s = (raw ?? "").trim();
  if (s === "" || s === "-") return 0;
  let neg = false;
  let t = s.replace(/\s/g, "").replace(/\$/g, "");
  if (/^\(.*\)$/.test(t)) {
    neg = true;
    t = t.slice(1, -1);
  }
  if (t.startsWith("-")) {
    neg = true;
    t = t.slice(1);
  }
  // es-CO: «.» miles, «,» decimal.
  t = t.replace(/\./g, "").replace(/,/g, ".");
  if (t === "") return 0;
  if (!/^\d+(\.\d+)?$/.test(t)) return null;
  const n = Number(t);
  if (Number.isNaN(n)) return null;
  return neg ? -n : n;
}

/** Monto desde una celda Excel: usa el número exacto si la celda es numérica
 * (evita perder decimales al pasar por texto); si es texto, lo parsea es-CO. */
function celdaMonto(v: unknown): number | null {
  if (v == null) return 0;
  if (typeof v === "number") return v;
  if (typeof v === "boolean") return v ? 1 : 0;
  if (typeof v === "object") {
    const o = v as { result?: unknown };
    if (typeof o.result === "number") return o.result;
    if (o.result != null) return parseMonto(String(o.result));
    return parseMonto(celdaTexto(v as ExcelJS.CellValue));
  }
  return parseMonto(String(v));
}

function aArrayBuffer(data: ArrayBuffer | Buffer): ArrayBuffer {
  if (data instanceof ArrayBuffer) return data;
  return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
}

function adaptarGrid(hoja: GridHoja): HojaBalance {
  return {
    nombre: hoja.nombre,
    totalFilas: hoja.filas.length,
    valoresFila: (fila) => hoja.filas[fila - 1] ?? [],
    valorCelda: (fila, columna) => hoja.filas[fila - 1]?.[columna - 1] ?? null,
  };
}

async function cargarHojaBalance(
  data: ArrayBuffer | Buffer,
  opciones: OpcionesParseBalance,
): Promise<HojaBalance | null> {
  const archivoNombre = opciones.archivoNombre ?? "balance.xlsx";
  if (/\.xls$/i.test(archivoNombre)) {
    const ingesta = await ingerir(aArrayBuffer(data), archivoNombre);
    if (ingesta.modo !== "tabular") return null;
    const grid =
      (opciones.hoja ? ingesta.hojas.find((hoja) => hoja.nombre === opciones.hoja) : null) ??
      ingesta.hojas.find((hoja) => hoja.nombre === HOJA) ??
      ingesta.hojas[0];
    return grid ? adaptarGrid(grid) : null;
  }

  const wb = await cargarWorkbook(data);
  if (!wb) return null;
  const ws =
    (opciones.hoja ? wb.getWorksheet(opciones.hoja) : undefined) ??
    wb.getWorksheet(HOJA) ??
    wb.worksheets[0];
  if (!ws) return null;
  return {
    nombre: ws.name,
    totalFilas: ws.rowCount,
    valoresFila: (fila) => ((ws.getRow(fila).values as ExcelJS.CellValue[]) ?? []).slice(1),
    valorCelda: (fila, columna) => ws.getRow(fila).getCell(columna).value,
  };
}

export async function parseBalanceWorkbook(
  data: ArrayBuffer | Buffer,
  opciones: OpcionesParseBalance = {},
): Promise<ParseBalance> {
  let ws: HojaBalance | null;
  try {
    ws = await cargarHojaBalance(data, opciones);
  } catch {
    ws = null;
  }
  if (!ws) {
    return {
      filas: [],
      errores: [
        {
          hoja: "Archivo",
          fila: 0,
          mensaje: "No se pudo leer el archivo. Asegúrate de subir un .xlsx, .xlsm o .xls válido (vuelve a guardarlo desde Excel si es necesario).",
        },
      ],
    };
  }

  // Encabezados en la fila 1. El orden de comprobación importa: «saldo
  // anterior» y «saldo final» antes que el genérico «saldo»; «código» antes
  // que «cuenta» (que es el nombre).
  const col: { code?: number; name?: number; prev?: number; final?: number; finalDeb?: number; finalCred?: number } = {};
  ws.valoresFila(1).forEach((valor, indice) => {
    const c = indice + 1;
    const h = normalizar(celdaTexto(valor as ExcelJS.CellValue));
    if (!h) return;
    if (h.includes("codigo") || h.includes("cod cuenta") || h.includes("cuenta puc")) col.code ??= c;
    else if (h.includes("saldo anterior") || h.includes("saldo inicial") || h.includes("saldo inicio") || h === "anterior" || h === "inicial") col.prev ??= c;
    else if (h.includes("saldo") && h.includes("debito")) col.finalDeb ??= c;
    else if (h.includes("saldo") && h.includes("credito")) col.finalCred ??= c;
    else if (h.includes("saldo final") || h.includes("nuevo saldo") || h.includes("saldo actual") || h.includes("saldo nuevo")) col.final ??= c;
    else if (h === "saldo" || h === "saldos" || h.includes("saldo neto")) col.final ??= c;
    else if (h.includes("nombre") || h.includes("descripcion") || h.includes("cuenta") || h.includes("rubro")) col.name ??= c;
    // Las columnas de movimiento (débito/crédito sin «saldo») se ignoran.
  });

  const faltan: string[] = [];
  if (!col.code) faltan.push("Código");
  if (!col.name) faltan.push("Cuenta/Nombre");
  if (!col.final && !col.finalDeb && !col.finalCred) faltan.push("Saldo final");
  if (faltan.length > 0) {
    return {
      filas: [],
      errores: [
        {
          hoja: ws.nombre,
          fila: 1,
          mensaje: `Encabezados incompletos: faltan columnas (${faltan.join(", ")}). Usa la plantilla: Código · Cuenta · Saldo anterior · Saldo final.`,
        },
      ],
    };
  }

  const filas: FilaBalance[] = [];
  const errores: ErrorImport[] = [];
  const vistos = new Map<string, number>(); // código → primera fila donde apareció
  const text = (fila: number, c?: number) =>
    c ? celdaTexto(ws.valorCelda(fila, c) as ExcelJS.CellValue) : "";

  for (let r = 2; r <= ws.totalFilas; r++) {
    const textoFila = ws.valoresFila(r).map((v) => celdaTexto(v as ExcelJS.CellValue)).join(" ");
    if (/EJEMPLO/i.test(textoFila)) continue;

    const code = text(r, col.code).replace(/[\s.]/g, "");
    const name = text(r, col.name);
    if (!code && !name) continue; // fila vacía
    // Filas de totales/secciones ("TOTAL ACTIVO", "ACTIVO"): código no numérico → se omiten.
    if (!/^\d+$/.test(code)) continue;

    const prev = col.prev ? celdaMonto(ws.valorCelda(r, col.prev)) : 0;
    const balance = col.final
      ? celdaMonto(ws.valorCelda(r, col.final))
      : (celdaMonto(col.finalDeb ? ws.valorCelda(r, col.finalDeb) : 0) ?? 0) -
        (celdaMonto(col.finalCred ? ws.valorCelda(r, col.finalCred) : 0) ?? 0);

    const errs: string[] = [];
    if (prev === null) errs.push(`Saldo anterior no numérico: «${text(r, col.prev)}».`);
    if (balance === null) errs.push(`Saldo final no numérico: «${col.final ? text(r, col.final) : ""}».`);
    if (!name) errs.push("Falta el nombre de la cuenta.");
    const prevVisto = vistos.get(code);
    if (prevVisto != null) errs.push(`Código repetido: ${code} (ya aparece en la fila ${prevVisto}).`);

    if (errs.length > 0) {
      for (const m of errs) errores.push({ hoja: ws.nombre, fila: r, mensaje: m });
      continue;
    }
    vistos.set(code, r);
    filas.push({ fila: r, code, name, prevBalance: prev ?? 0, balance: balance ?? 0 });
  }

  if (filas.length === 0 && errores.length === 0) {
    errores.push({ hoja: ws.nombre, fila: 0, mensaje: "No se encontraron cuentas en el archivo (¿quedaron solo los ejemplos?)." });
  }

  return { filas, errores };
}
