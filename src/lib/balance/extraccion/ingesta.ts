// Ingesta de archivos para la extracción de balances.
//
// Convierte el archivo subido (xlsx/csv/json/pdf) en una representación
// que el pipeline pueda usar:
//   - modo "tabular": grillas (matriz de celdas) por hoja → ruta de detección de
//     estructura + transformación determinista.
//   - modo "documento": un bloque PDF (base64) o texto → ruta de extracción
//     directa con IA (PDF y JSON/otros no tabulares).
//
// Solo el código toca todas las filas; al modelo se le envía una vista previa
// (la construye el orquestador a partir de las grillas).
import ExcelJS from "exceljs";

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

// Límite de páginas por documento de la API de Anthropic (PDF).
export const LIMITE_PAGINAS_PDF = 100;

/**
 * Estimación best-effort del número de páginas de un PDF. Devuelve `null` si no
 * se puede determinar con confianza (p. ej. object streams comprimidos), para
 * NO bloquear archivos válidos: la verificación es fail-open.
 */
export function contarPaginasPDF(data: ArrayBuffer): number | null {
  try {
    const texto = new TextDecoder("latin1").decode(new Uint8Array(data));
    // El `/Count` del nodo raíz `/Pages` es el total; tomamos el mayor de los presentes.
    const cuentas = [...texto.matchAll(/\/Count\s+(\d+)/g)].map((m) => Number(m[1]));
    if (cuentas.length > 0) return Math.max(...cuentas);
    // Respaldo: contar marcadores `/Type /Page` (sin la «s» de `/Pages`).
    const paginas = (texto.match(/\/Type\s*\/Page[^s]/g) ?? []).length;
    return paginas > 0 ? paginas : null;
  } catch {
    return null;
  }
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

/** Lee un libro OOXML (.xlsx/.xlsm) a grillas por hoja, saltando filas vacías. */
async function leerLibroExcel(data: ArrayBuffer): Promise<GridHoja[]> {
  const wb = new ExcelJS.Workbook();
  const carga = Buffer.from(data) as unknown as Parameters<typeof wb.xlsx.load>[0];
  await wb.xlsx.load(carga);

  return wb.worksheets.map((ws) => {
    const filas: CeldaCruda[][] = [];
    ws.eachRow({ includeEmpty: false }, (row) => {
      const values = (row.values as ExcelJS.CellValue[]).slice(1).map(celdaExcel);
      if (filaTieneDatos(values)) filas.push(values);
    });
    return { nombre: ws.name, filas };
  });
}

function parseCsv(texto: string): CeldaCruda[][] {
  const filas: string[][] = [];
  let fila: string[] = [];
  let celda = "";
  let entreComillas = false;

  for (let i = 0; i < texto.length; i++) {
    const ch = texto[i];
    const next = texto[i + 1];

    if (entreComillas) {
      if (ch === "\"" && next === "\"") {
        celda += "\"";
        i++;
      } else if (ch === "\"") {
        entreComillas = false;
      } else {
        celda += ch;
      }
      continue;
    }

    if (ch === "\"") {
      entreComillas = true;
    } else if (ch === ",") {
      fila.push(celda);
      celda = "";
    } else if (ch === "\n") {
      fila.push(celda);
      filas.push(fila);
      fila = [];
      celda = "";
    } else if (ch !== "\r") {
      celda += ch;
    }
  }

  fila.push(celda);
  filas.push(fila);

  return filas
    .map((r) =>
      r.map((v) => {
        const s = v.trim();
        if (!s) return null;
        const n = numeroCsv(s);
        return n == null ? s : n;
      }),
    )
    .filter(filaTieneDatos);
}

function leerCsv(data: ArrayBuffer): GridHoja[] {
  return [{ nombre: "csv", filas: parseCsv(new TextDecoder().decode(data)) }];
}

function numeroCsv(s: string): number | null {
  if (/^-?\d+$/.test(s)) return Number(s);
  if (/^-?\d+\.\d+$/.test(s)) return Number(s);
  if (/^-?\d+,\d+$/.test(s)) return Number(s.replace(",", "."));
  if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) {
    return Number(s.replace(/\./g, "").replace(",", "."));
  }
  if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) {
    return Number(s.replace(/,/g, ""));
  }
  return null;
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
export async function ingerir(data: ArrayBuffer, fileName: string): Promise<Ingesta> {
  const formato = detectarFormato(fileName, data);
  switch (formato) {
    case "pdf":
      return { modo: "documento", documento: { tipo: "pdf", base64: aBase64(data) } };
    case "json":
      return ingerirJson(new TextDecoder().decode(data));
    case "csv":
      return { modo: "tabular", hojas: leerCsv(data) };
    case "xlsx":
      return { modo: "tabular", hojas: await leerLibroExcel(data) };
    case "xls":
    case "xlsb":
      throw new Error("Por seguridad, los formatos .xls y .xlsb no se procesan. Guarda el archivo como .xlsx o usa CSV, JSON o PDF.");
    default:
      // Último intento seguro: probar como OOXML moderno (.xlsx/.xlsm).
      try {
        return { modo: "tabular", hojas: await leerLibroExcel(data) };
      } catch {
        throw new Error("Formato de archivo no reconocido. Usa Excel (.xlsx/.xlsm), CSV, JSON o PDF.");
      }
  }
}

/**
 * Vista previa compacta para enviar al modelo (no las filas completas): hasta
 * `maxFilas` por hoja y `maxCols` columnas, con índices 1-based para que el
 * modelo pueda referirse a filas/columnas exactas.
 */
export function construirVistaPrevia(hojas: GridHoja[], maxFilas = 60, maxCols = 25): string {
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
