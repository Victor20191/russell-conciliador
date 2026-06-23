// Parser del Excel de balance de comprobación (`Plantilla_Balance_Comprobacion.xlsx`).
// Lee la hoja «Balance» (encabezados en la fila 1, datos desde la fila 2) y
// devuelve las cuentas crudas + errores de estructura. El cálculo de agregados
// (mapeo, sumas, validaciones) vive en `src/lib/balance/calcular.ts` y la
// persistencia/versionado en la Server Action `confirmarCargaBalance`.

import type ExcelJS from "exceljs";
import { celdaTexto, normalizar, cargarWorkbook } from "./xlsx";
import type { ErrorImport } from "./maestros";
import type { Excepcion, ResumenAuditoria } from "@/lib/balance/extraccion/esquema";

const HOJA = "Balance";

export type FilaBalance = { fila: number; code: string; name: string; prevBalance: number; balance: number };
export type ParseBalance = { filas: FilaBalance[]; errores: ErrorImport[] };

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

/** Monto desde una celda exceljs: usa el número exacto si la celda es numérica
 * (evita perder decimales al pasar por texto); si es texto, lo parsea es-CO. */
function celdaMonto(v: ExcelJS.CellValue): number | null {
  if (v == null) return 0;
  if (typeof v === "number") return v;
  if (typeof v === "boolean") return v ? 1 : 0;
  if (typeof v === "object") {
    const o = v as { result?: unknown };
    if (typeof o.result === "number") return o.result;
    if (o.result != null) return parseMonto(String(o.result));
    return parseMonto(celdaTexto(v));
  }
  return parseMonto(String(v));
}

export async function parseBalanceWorkbook(data: ArrayBuffer | Buffer): Promise<ParseBalance> {
  const wb = await cargarWorkbook(data);
  if (!wb) {
    return {
      filas: [],
      errores: [
        {
          hoja: "Archivo",
          fila: 0,
          mensaje: "No se pudo leer el archivo. Asegúrate de subir un .xlsx válido (vuelve a guardarlo desde Excel si es necesario).",
        },
      ],
    };
  }
  // Hoja «Balance»; si no está, se toma la primera hoja del libro.
  const ws = wb.getWorksheet(HOJA) ?? wb.worksheets[0];
  if (!ws) {
    return { filas: [], errores: [{ hoja: HOJA, fila: 0, mensaje: `No se encontró ninguna hoja en el archivo.` }] };
  }

  // Encabezados en la fila 1. El orden de comprobación importa: «saldo
  // anterior» y «saldo final» antes que el genérico «saldo»; «código» antes
  // que «cuenta» (que es el nombre).
  const col: { code?: number; name?: number; prev?: number; final?: number; finalDeb?: number; finalCred?: number } = {};
  ws.getRow(1).eachCell((cell, c) => {
    const h = normalizar(celdaTexto(cell.value));
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
          hoja: HOJA,
          fila: 1,
          mensaje: `Encabezados incompletos: faltan columnas (${faltan.join(", ")}). Usa la plantilla: Código · Cuenta · Saldo anterior · Saldo final.`,
        },
      ],
    };
  }

  const filas: FilaBalance[] = [];
  const errores: ErrorImport[] = [];
  const vistos = new Map<string, number>(); // código → primera fila donde apareció
  const text = (row: ExcelJS.Row, c?: number) => (c ? celdaTexto(row.getCell(c).value) : "");

  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const textoFila = ((row.values as ExcelJS.CellValue[]) ?? []).map((v) => celdaTexto(v)).join(" ");
    if (/EJEMPLO/i.test(textoFila)) continue;

    const code = text(row, col.code).replace(/[\s.]/g, "");
    const name = text(row, col.name);
    if (!code && !name) continue; // fila vacía
    // Filas de totales/secciones ("TOTAL ACTIVO", "ACTIVO"): código no numérico → se omiten.
    if (!/^\d+$/.test(code)) continue;

    const prev = col.prev ? celdaMonto(row.getCell(col.prev).value) : 0;
    const balance = col.final
      ? celdaMonto(row.getCell(col.final).value)
      : (celdaMonto(col.finalDeb ? row.getCell(col.finalDeb).value : 0) ?? 0) -
        (celdaMonto(col.finalCred ? row.getCell(col.finalCred).value : 0) ?? 0);

    const errs: string[] = [];
    if (prev === null) errs.push(`Saldo anterior no numérico: «${text(row, col.prev)}».`);
    if (balance === null) errs.push(`Saldo final no numérico: «${col.final ? text(row, col.final) : ""}».`);
    if (!name) errs.push("Falta el nombre de la cuenta.");
    const prevVisto = vistos.get(code);
    if (prevVisto != null) errs.push(`Código repetido: ${code} (ya aparece en la fila ${prevVisto}).`);

    if (errs.length > 0) {
      for (const m of errs) errores.push({ hoja: HOJA, fila: r, mensaje: m });
      continue;
    }
    vistos.set(code, r);
    filas.push({ fila: r, code, name, prevBalance: prev ?? 0, balance: balance ?? 0 });
  }

  if (filas.length === 0 && errores.length === 0) {
    errores.push({ hoja: HOJA, fila: 0, mensaje: "No se encontraron cuentas en el archivo (¿quedaron solo los ejemplos?)." });
  }

  return { filas, errores };
}
