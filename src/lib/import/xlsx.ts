// Utilidades compartidas de lectura de Excel (exceljs) para los importadores.
import ExcelJS from "exceljs";

/** Texto plano de una celda (string, número, richText, fórmula, hipervínculo…). */
export function celdaTexto(v: ExcelJS.CellValue): string {
  if (v == null) return "";
  if (typeof v === "string") return v.trim();
  if (typeof v === "number" || typeof v === "boolean") return String(v).trim();
  if (typeof v === "object") {
    const o = v as { text?: unknown; richText?: { text: string }[]; result?: unknown };
    if (typeof o.text === "string") return o.text.trim();
    if (Array.isArray(o.richText)) return o.richText.map((r) => r.text).join("").trim();
    if (o.result != null) return String(o.result).trim();
  }
  return String(v).trim();
}

/** Normaliza un encabezado/valor: sin acentos, sin «*», minúsculas, sin espacios extra. */
export function normalizar(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\*/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/**
 * Carga un workbook desde un ArrayBuffer/Buffer. Devuelve null si el archivo no
 * es un .xlsx legible (exceljs lanza al reconciliar archivos mal formados).
 */
export async function cargarWorkbook(
  data: ArrayBuffer | Buffer,
): Promise<ExcelJS.Workbook | null> {
  const wb = new ExcelJS.Workbook();
  try {
    // exceljs tipa `load(buffer: Buffer)` con un @types/node distinto: se castea
    // al tipo exacto que espera load para evitar el desajuste del Buffer genérico.
    const carga = Buffer.from(data as ArrayBuffer) as unknown as Parameters<typeof wb.xlsx.load>[0];
    await wb.xlsx.load(carga);
    return wb;
  } catch {
    return null;
  }
}
