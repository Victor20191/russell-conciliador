// Ingesta de archivos para la extracción de balances.
//
// Convierte el archivo subido (xlsx/xls/xlsb/csv/json/pdf) en una representación
// que el pipeline pueda usar:
//   - modo "tabular": grillas (matriz de celdas) por hoja → ruta de detección de
//     estructura + transformación determinista.
//   - modo "documento": un bloque PDF (base64) o texto → ruta de extracción
//     directa con IA (PDF y JSON/otros no tabulares).
//
// Solo el código toca todas las filas; al modelo se le envía una vista previa
// (la construye el orquestador a partir de las grillas).
import * as XLSX from "xlsx";

export type CeldaCruda = string | number | boolean | null;
export type GridHoja = { nombre: string; filas: CeldaCruda[][] };

export type DocumentoIA = { tipo: "pdf"; base64: string } | { tipo: "texto"; texto: string };

export type Ingesta =
  | { modo: "tabular"; hojas: GridHoja[] }
  | { modo: "documento"; documento: DocumentoIA };

export type Formato = "xlsx" | "xls" | "xlsb" | "csv" | "json" | "pdf" | "desconocido";

const PDF_MAGIC = "%PDF-";

/** Deduce el formato por extensión y, como respaldo, por la firma del contenido. */
export function detectarFormato(fileName: string, data: ArrayBuffer): Formato {
  const ext = fileName.toLowerCase().split(".").pop() ?? "";
  if (ext === "xlsx" || ext === "xlsm") return "xlsx";
  if (ext === "xls") return "xls";
  if (ext === "xlsb") return "xlsb";
  if (ext === "csv" || ext === "txt") return "csv";
  if (ext === "json") return "json";
  if (ext === "pdf") return "pdf";
  // Firma: %PDF al inicio.
  const head = new TextDecoder().decode(new Uint8Array(data).subarray(0, 5));
  if (head === PDF_MAGIC) return "pdf";
  return "desconocido";
}

/** Convierte un Buffer a base64 sin saltos de línea (requisito de la API). */
function aBase64(data: ArrayBuffer): string {
  return Buffer.from(data).toString("base64");
}

/** Lee un libro (xlsx/xls/xlsb/csv) a grillas por hoja, saltando filas vacías. */
function leerLibro(data: ArrayBuffer): GridHoja[] {
  const wb = XLSX.read(Buffer.from(data), { type: "buffer", raw: true, cellDates: false });
  return wb.SheetNames.map((nombre) => {
    const ws = wb.Sheets[nombre];
    const filas = XLSX.utils.sheet_to_json<CeldaCruda[]>(ws, {
      header: 1,
      raw: true,
      defval: null,
      blankrows: false,
    });
    return { nombre, filas };
  });
}

/** JSON tabular (arreglo de objetos) → grilla; cualquier otro JSON → texto. */
function ingerirJson(texto: string): Ingesta {
  let parsed: unknown;
  try {
    parsed = JSON.parse(texto);
  } catch {
    return { modo: "documento", documento: { tipo: "texto", texto } };
  }
  if (Array.isArray(parsed) && parsed.length > 0 && typeof parsed[0] === "object" && parsed[0] !== null) {
    const claves = [...new Set(parsed.flatMap((o) => (o && typeof o === "object" ? Object.keys(o) : [])))];
    const filas: CeldaCruda[][] = [
      claves,
      ...parsed.map((o) =>
        claves.map((k) => {
          const v = (o as Record<string, unknown>)?.[k];
          return v == null || ["string", "number", "boolean"].includes(typeof v) ? (v as CeldaCruda) : JSON.stringify(v);
        }),
      ),
    ];
    return { modo: "tabular", hojas: [{ nombre: "json", filas }] };
  }
  return { modo: "documento", documento: { tipo: "texto", texto } };
}

/**
 * Ingiere el archivo. Lanza si el formato es ilegible (lo captura el orquestador
 * y lo convierte en una excepción del cargue).
 */
export function ingerir(data: ArrayBuffer, fileName: string): Ingesta {
  const formato = detectarFormato(fileName, data);
  switch (formato) {
    case "pdf":
      return { modo: "documento", documento: { tipo: "pdf", base64: aBase64(data) } };
    case "json":
      return ingerirJson(new TextDecoder().decode(data));
    case "csv":
    case "xlsx":
    case "xls":
    case "xlsb":
      return { modo: "tabular", hojas: leerLibro(data) };
    default:
      // Último intento: tratar como libro (SheetJS sniffa varios formatos).
      try {
        return { modo: "tabular", hojas: leerLibro(data) };
      } catch {
        throw new Error("Formato de archivo no reconocido. Usa Excel (.xlsx/.xls/.xlsb), CSV, JSON o PDF.");
      }
  }
}

/**
 * Vista previa compacta para enviar al modelo (no las filas completas): hasta
 * `maxFilas` por hoja y `maxCols` columnas, con índices 1-based para que el
 * modelo pueda referirse a filas/columnas exactas.
 */
export function construirVistaPrevia(hojas: GridHoja[], maxFilas = 40, maxCols = 25): string {
  const partes: string[] = [];
  for (const hoja of hojas) {
    const total = hoja.filas.length;
    const muestra = hoja.filas.slice(0, maxFilas);
    partes.push(`### Hoja "${hoja.nombre}" — ${total} fila(s)`);
    muestra.forEach((fila, i) => {
      const celdas = fila.slice(0, maxCols).map((c, j) => `C${j + 1}=${formatearCelda(c)}`);
      partes.push(`F${i + 1}: ${celdas.join("  ")}`);
    });
    if (total > maxFilas) partes.push(`… (${total - maxFilas} filas más, no mostradas)`);
  }
  return partes.join("\n");
}

function formatearCelda(c: CeldaCruda): string {
  if (c == null) return "∅";
  const s = String(c).replace(/\s+/g, " ").trim();
  return s.length > 40 ? `«${s.slice(0, 40)}…»` : `«${s}»`;
}
