// Ingesta de archivos para la extracción de balances.
//
// Convierte el archivo subido (xlsx/csv/txt/json/pdf) en una representación
// que el pipeline pueda usar:
//   - modo "tabular": grillas (matriz de celdas) por hoja → ruta de detección de
//     estructura + transformación determinista. CSV y TXT delimitado (tab, pipe,
//     «;» o coma, detectado del contenido) entran por aquí.
//   - modo "documento": un bloque PDF (base64) o texto → ruta de extracción
//     directa con IA (PDF, TXT de ancho fijo y JSON/otros no tabulares).
//
// Solo el código toca todas las filas; al modelo se le envía una vista previa
// (la construye el orquestador a partir de las grillas).
import ExcelJS from "exceljs";

export type CeldaCruda = string | number | boolean | null;
// `negrita` (solo XLSX): por cada fila de `filas`, el flag NEGRITA de cada celda
// (alineado 0-based con la fila). Muchos ERP marcan las cuentas AGRUPADORAS en
// negrita — es su propia clasificación, más confiable que inferir por código.
export type GridHoja = { nombre: string; filas: CeldaCruda[][]; negrita?: boolean[][] };

export type DocumentoIA = { tipo: "pdf"; base64: string } | { tipo: "texto"; texto: string };

export type Ingesta =
  | { modo: "tabular"; hojas: GridHoja[] }
  | { modo: "documento"; documento: DocumentoIA };

export type Formato = "xlsx" | "xls" | "xlsb" | "csv" | "txt" | "json" | "pdf" | "desconocido";

const PDF_MAGIC = "%PDF-";

/** Deduce el formato por extensión y, como respaldo, por la firma del contenido. */
export function detectarFormato(fileName: string, data: ArrayBuffer): Formato {
  const ext = fileName.toLowerCase().split(".").pop() ?? "";
  if (ext === "xlsx" || ext === "xlsm") return "xlsx";
  if (ext === "xls") return "xls";
  if (ext === "xlsb") return "xlsb";
  if (ext === "csv") return "csv";
  if (ext === "txt") return "txt";
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
    const negrita: boolean[][] = [];
    ws.eachRow({ includeEmpty: false }, (row) => {
      const values = (row.values as ExcelJS.CellValue[]).slice(1).map(celdaExcel);
      if (!filaTieneDatos(values)) return;
      filas.push(values);
      // Flag NEGRITA por celda (exceljs: `cell.font.bold`; celdas 1-based) alineado
      // 0-based con `values`. Respalda con la negrita a nivel de fila si la trae.
      const filaBold = (row as unknown as { font?: { bold?: boolean } }).font?.bold === true;
      negrita.push(values.map((_, j) => filaBold || row.getCell(j + 1).font?.bold === true));
    });
    return { nombre: ws.name, filas, negrita };
  });
}

// Delimitadores admitidos en texto plano (CSV y archivos planos .txt de ERP).
const DELIMITADORES_PLANO = ["\t", "|", ";", ","] as const;
export type DelimitadorPlano = (typeof DELIMITADORES_PLANO)[number];

/** Decodifica texto plano: UTF-8 estricto y, si no es UTF-8 válido (exportes latin1/windows-1252 típicos de ERP), latin1. */
function decodificarTexto(data: ArrayBuffer): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(data);
  } catch {
    return new TextDecoder("latin1").decode(data);
  }
}

/**
 * Detecta el delimitador de un texto plano contando apariciones FUERA de
 * comillas en las primeras líneas con contenido. Se prueba en orden de
 * especificidad (tab, pipe, punto y coma, coma): tab/pipe/«;» casi nunca
 * aparecen en los datos, mientras que la coma sí (decimales «1.234,56»,
 * nombres «PEREZ, JUAN») — por eso es la última. Gana el primero presente en
 * más de la mitad de las líneas; `null` si ninguno (ancho fijo u otro texto).
 */
export function detectarDelimitador(texto: string, maxLineas = 50): DelimitadorPlano | null {
  const lineas = texto.split(/\r?\n/).filter((l) => l.trim() !== "").slice(0, maxLineas);
  if (lineas.length === 0) return null;
  const lineasCon = (d: DelimitadorPlano) =>
    lineas.filter((linea) => {
      let entreComillas = false;
      for (const ch of linea) {
        if (ch === "\"") entreComillas = !entreComillas;
        else if (!entreComillas && ch === d) return true;
      }
      return false;
    }).length;
  for (const d of DELIMITADORES_PLANO) {
    if (lineasCon(d) > lineas.length / 2) return d;
  }
  return null;
}

function parseDelimitado(texto: string, delimitador: DelimitadorPlano): CeldaCruda[][] {
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
    } else if (ch === delimitador) {
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

/**
 * Texto plano delimitado (CSV o .txt de ERP) → grilla tabular. El delimitador se
 * detecta del contenido; en CSV sin delimitador claro se asume coma (compat).
 * El nombre de hoja se mantiene «csv» para AMBOS formatos: la HUELLA de los
 * perfiles guardados incluye el nombre de hoja y los .txt ya entraban por aquí.
 */
function leerTextoPlano(texto: string, delimitador: DelimitadorPlano): GridHoja[] {
  return [{ nombre: "csv", filas: parseDelimitado(texto, delimitador) }];
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
      return ingerirJson(decodificarTexto(data));
    case "csv": {
      const texto = decodificarTexto(data);
      return { modo: "tabular", hojas: leerTextoPlano(texto, detectarDelimitador(texto) ?? ",") };
    }
    case "txt": {
      // Archivo PLANO (.txt): delimitado (tab/pipe/;/,) → grilla tabular, misma
      // ruta que CSV. Sin delimitador (ancho fijo u otro texto) → documento de
      // texto para la extracción DIRECTA con IA.
      const texto = decodificarTexto(data);
      const delimitador = detectarDelimitador(texto);
      if (delimitador) return { modo: "tabular", hojas: leerTextoPlano(texto, delimitador) };
      return { modo: "documento", documento: { tipo: "texto", texto } };
    }
    case "xlsx":
      return { modo: "tabular", hojas: await leerLibroExcel(data) };
    case "xls":
    case "xlsb":
      throw new Error("Por seguridad, los formatos .xls y .xlsb no se procesan. Guarda el archivo como .xlsx o usa CSV, TXT, JSON o PDF.");
    default:
      // Último intento seguro: probar como OOXML moderno (.xlsx/.xlsm).
      try {
        return { modo: "tabular", hojas: await leerLibroExcel(data) };
      } catch {
        throw new Error("Formato de archivo no reconocido. Usa Excel (.xlsx/.xlsm), CSV, TXT (plano), JSON o PDF.");
      }
  }
}

// Cuántas filas del FINAL de la hoja se incluyen en la vista previa cuando el
// archivo es más largo que `maxFilas` (la fila de TOTALES suele ir al final y
// el modelo la necesita para verificar su mapeo de columnas).
const FILAS_COLA_VISTA = 10;
// Tope duro de columnas de la vista (por costo); el mínimo son las 25 de siempre.
const MAX_COLS_VISTA = 40;

/**
 * Vista previa compacta para enviar al modelo (no las filas completas): hasta
 * `maxFilas` por hoja y `maxCols` columnas, con índices 1-based para que el
 * modelo pueda referirse a filas/columnas exactas.
 * - Si la hoja excede `maxFilas`, se muestran las primeras `maxFilas − 10` y
 *   las ÚLTIMAS 10 con su índice 1-based REAL (ahí suele estar TOTALES).
 * - Las filas en negrita (solo XLSX) van marcadas `F12*:` — señal de agrupadora.
 * - `maxCols` se amplía hasta 40 si la hoja usa más de 25 columnas con datos.
 */
export function construirVistaPrevia(hojas: GridHoja[], maxFilas = 60, maxCols = 25): string {
  const partes: string[] = [];
  for (const hoja of hojas) {
    const total = hoja.filas.length;
    // Columnas adaptativas: cubre hasta la última columna CON DATOS de la hoja,
    // sin bajar del mínimo pedido ni superar el tope duro.
    const colsUsadas = hoja.filas.reduce((m, f) => {
      for (let j = f.length - 1; j >= m; j--) {
        if (f[j] != null && String(f[j]).trim() !== "") return j + 1;
      }
      return m;
    }, 0);
    const cols = Math.min(MAX_COLS_VISTA, Math.max(maxCols, colsUsadas));

    const linea = (fila: CeldaCruda[], idx0: number) => {
      const celdas = fila.slice(0, cols).map((c, j) => `C${j + 1}=${formatearCelda(c)}`);
      // Marca `*` si alguna celda no vacía de la fila va en negrita.
      const negrita = hoja.negrita?.[idx0]?.some((b, j) => b && fila[j] != null && String(fila[j]).trim() !== "") ?? false;
      return `F${idx0 + 1}${negrita ? "*" : ""}: ${celdas.join("  ")}`;
    };

    partes.push(`### Hoja "${hoja.nombre}" — ${total} fila(s)`);
    if (total <= maxFilas) {
      hoja.filas.forEach((fila, i) => partes.push(linea(fila, i)));
    } else {
      // Cabeza + cola con índices REALES: la fila TOTALES del final queda visible
      // y los índices siguen siendo válidos para el MappingSpec.
      const cabeza = Math.max(1, maxFilas - FILAS_COLA_VISTA);
      const inicioCola = Math.max(cabeza, total - FILAS_COLA_VISTA);
      for (let i = 0; i < cabeza; i++) partes.push(linea(hoja.filas[i], i));
      if (inicioCola > cabeza) partes.push(`… (${inicioCola - cabeza} filas intermedias omitidas)`);
      for (let i = inicioCola; i < total; i++) partes.push(linea(hoja.filas[i], i));
    }
  }
  return partes.join("\n");
}

function formatearCelda(c: CeldaCruda): string {
  if (c == null) return "∅";
  const s = String(c).replace(/\s+/g, " ").trim();
  return s.length > 40 ? `«${s.slice(0, 40)}…»` : `«${s}»`;
}
