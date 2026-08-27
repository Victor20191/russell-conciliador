// Ingesta de archivos para la extracción de balances.
//
// Convierte el archivo subido (xlsx/xls/csv/txt/json/pdf) en una representación
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
import { Readable } from "node:stream";

export type CeldaCruda = string | number | boolean | null;
// `negrita` (XLSX/XLSM y XLS cuando BIFF conserva el estilo): por cada fila de
// `filas`, el flag NEGRITA de cada celda (alineado 0-based con la fila). Muchos
// ERP marcan las cuentas AGRUPADORAS/consolidadas en negrita — es su propia
// clasificación, más confiable que inferir por código.
export type GridHoja = { nombre: string; filas: CeldaCruda[][]; negrita?: boolean[][] };

export type DocumentoIA = { tipo: "pdf"; base64: string } | { tipo: "texto"; texto: string };

export type Ingesta =
  | { modo: "tabular"; hojas: GridHoja[] }
  | { modo: "documento"; documento: DocumentoIA };

export type Formato = "xlsx" | "xls" | "xlsb" | "csv" | "txt" | "json" | "pdf" | "desconocido";

const PDF_MAGIC = "%PDF-";
const CFB_MAGIC = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1] as const;

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
  const bytes = new Uint8Array(data);
  const head = new TextDecoder().decode(bytes.subarray(0, 5));
  if (head === PDF_MAGIC) return "pdf";
  // Firma Compound File Binary usada por los libros Excel 97-2003 (.xls).
  if (CFB_MAGIC.every((byte, index) => bytes[index] === byte)) return "xls";
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
    // Celda con FÓRMULA: solo vale el resultado cacheado. El lector streaming de exceljs
    // (4.4) OMITE `result` cuando el valor cacheado es 0 (falsy), y un libro guardado sin
    // recalcular tampoco lo trae. En ambos casos NO hay dato: se devuelve null. Antes caía
    // al `JSON.stringify` de abajo y el texto `{"formula":"P2427*Q2427"}` llegaba al parser
    // numérico, que extraía los dígitos de las referencias (¡2427!) e "inventaba" un monto
    // igual al número de fila. Nunca se debe derivar un valor del texto de una fórmula.
    if ("formula" in v || "sharedFormula" in v) {
      return "result" in v ? celdaExcel(v.result as ExcelJS.CellValue) : null;
    }
    if ("result" in v) return celdaExcel(v.result as ExcelJS.CellValue);
    if ("text" in v && typeof v.text === "string") return v.text;
    if ("richText" in v && Array.isArray(v.richText)) {
      return v.richText.map((r) => r.text ?? "").join("");
    }
    // Objeto desconocido (p. ej. `{error: "#DIV/0!"}`): sin dato interpretable.
    return null;
  }
  return String(v);
}

function filaTieneDatos(fila: CeldaCruda[]): boolean {
  return fila.some((c) => c != null && String(c).trim() !== "");
}

/**
 * Lee un libro OOXML (.xlsx/.xlsm) a grillas por hoja, saltando filas vacías.
 *
 * El lector documental de ExcelJS conserva simultáneamente el XML descomprimido,
 * el workbook completo y nuestra grilla final. En balances con cientos de miles
 * de filas esa combinación puede multiplicar por ~100 el tamaño comprimido del
 * archivo y agotar la memoria del proceso. El lector streaming libera cada fila
 * de ExcelJS apenas la convertimos, pero conserva shared strings y estilos para
 * no perder nombres, fechas ni la señal de negrita usada por balances de terceros.
 */
async function leerLibroExcel(data: ArrayBuffer): Promise<GridHoja[]> {
  const entrada = Readable.from([Buffer.from(data)]);
  const wb = new ExcelJS.stream.xlsx.WorkbookReader(entrada, {
    worksheets: "emit",
    sharedStrings: "cache",
    hyperlinks: "ignore",
    styles: "cache",
    entries: "ignore",
  });
  const hojas: GridHoja[] = [];

  for await (const ws of wb) {
    const nombreHoja = (ws as unknown as { name?: string; id?: number }).name
      ?? `Hoja ${String((ws as unknown as { id?: number }).id ?? hojas.length + 1)}`;
    const filas: CeldaCruda[][] = [];
    const negrita: boolean[][] = [];
    for await (const row of ws) {
      const values = (row.values as ExcelJS.CellValue[]).slice(1).map(celdaExcel);
      if (!filaTieneDatos(values)) continue;
      filas.push(values);
      // Flag NEGRITA por celda (exceljs: `cell.font.bold`; celdas 1-based) alineado
      // 0-based con `values`. Respalda con la negrita a nivel de fila si la trae.
      const filaBold = (row as unknown as { font?: { bold?: boolean } }).font?.bold === true;
      negrita.push(values.map((_, j) => filaBold || row.getCell(j + 1).font?.bold === true));
    }
    hojas.push({ nombre: nombreHoja, filas, negrita });
  }

  return hojas;
}

/**
 * Respaldo tolerante para OOXML producido por ERPs que Excel abre/repara, pero
 * cuya metadata no cumple estrictamente el esquema que espera ExcelJS. SheetJS
 * se usa solo si falla el lector principal: se conservan los valores, aunque un
 * libro reparado por esta vía puede no exponer la señal visual de negrita.
 */
async function leerLibroExcelAlterno(data: ArrayBuffer): Promise<GridHoja[]> {
  const XLSX = await import("xlsx");
  const wb = XLSX.read(new Uint8Array(data), {
    type: "array",
    raw: true,
    dense: true,
    cellDates: false,
    cellFormula: false,
    cellHTML: false,
    bookVBA: false,
  });

  return wb.SheetNames.map((nombre) => {
    const ws = wb.Sheets[nombre];
    if (!ws) return { nombre, filas: [] };
    const filas = XLSX.utils
      .sheet_to_json<unknown[]>(ws, {
        header: 1,
        raw: true,
        defval: null,
        blankrows: false,
      })
      .map((fila) => fila.map(celdaXls))
      .filter(filaTieneDatos);
    return { nombre, filas };
  });
}

async function leerLibroExcelTolerante(data: ArrayBuffer): Promise<GridHoja[]> {
  try {
    return await leerLibroExcel(data);
  } catch (errorExcelJs) {
    try {
      return await leerLibroExcelAlterno(data);
    } catch (errorSheetJs) {
      throw new AggregateError(
        [errorExcelJs, errorSheetJs],
        "No se pudo leer el archivo de Excel. Ábrelo en Excel, guárdalo nuevamente como .xlsx e intenta otra vez.",
      );
    }
  }
}

// SheetJS 0.20 lee los VALORES de BIFF8, pero elimina el índice XF/fuente de
// cada celda antes de exponer la hoja (incluso con `cellStyles`). Para un balance
// por tercero esa pérdida es funcional: SIIGO distingue la cuenta consolidada
// (negrita) de sus NIT/cédulas (sin negrita). Esta pasada mínima sobre el stream
// `/Workbook` recupera SOLO esa señal, sin interpretar fórmulas ni valores.
type CeldasNegritaBiff = Array<Map<number, Set<number>>>; // hoja → fila → columnas

const REGISTROS_CELDA_XF = new Set([
  0x0003, // BIFF2NUM
  0x0004, // BIFF2STR
  0x0006, // Formula
  0x00d6, // RString
  0x00fd, // LabelSst
  0x0203, // Number
  0x0204, // Label
  0x0205, // BoolErr
  0x027e, // RK
]);

function u16(bytes: Uint8Array, offset: number): number {
  return bytes[offset] | (bytes[offset + 1] << 8);
}

function u32(bytes: Uint8Array, offset: number): number {
  return (u16(bytes, offset) | (u16(bytes, offset + 2) << 16)) >>> 0;
}

/**
 * Extrae las celdas en negrita de un stream BIFF5/BIFF8 ya desempaquetado.
 * Exportada para probar la decodificación binaria con registros sintéticos;
 * la ingesta pública sigue siendo `ingerir()`.
 */
export function extraerCeldasNegritaBiffXls(workbook: Uint8Array): CeldasNegritaBiff {
  const fuentesNegrita: Array<boolean | null> = [];
  const fuentePorXf: number[] = [];
  const indiceHojaPorOffset = new Map<number, number>();
  const celdas: CeldasNegritaBiff = [];
  let siguienteHojaFisica = 0;
  let hojaActual: number | null = null;

  const marcar = (fila: number, columna: number, xf: number) => {
    if (hojaActual == null) return;
    const fuente = fuentePorXf[xf];
    if (fuente == null || fuentesNegrita[fuente] !== true) return;
    const porFila = celdas[hojaActual] ?? (celdas[hojaActual] = new Map());
    const columnas = porFila.get(fila) ?? new Set<number>();
    columnas.add(columna);
    porFila.set(fila, columnas);
  };

  for (let offset = 0; offset + 4 <= workbook.length;) {
    const tipo = u16(workbook, offset);
    const largo = u16(workbook, offset + 2);
    const inicio = offset + 4;
    const fin = inicio + largo;
    if (fin > workbook.length) break;

    if (tipo === 0x0085 && largo >= 8) {
      // BoundSheet8: `lbPlyPos` apunta al BOF físico de la hoja. Conserva el
      // orden lógico de SheetNames aunque los substreams no vengan consecutivos.
      indiceHojaPorOffset.set(u32(workbook, inicio), indiceHojaPorOffset.size);
    } else if (tipo === 0x0031 && largo >= 8) {
      // BIFF reserva el índice de fuente 4; el quinto registro es la fuente 5.
      if (fuentesNegrita.length === 4) fuentesNegrita.push(null);
      const peso = u16(workbook, inicio + 6); // `bls`: 400 normal, 700 negrita
      fuentesNegrita.push(peso >= 700);
    } else if (tipo === 0x00e0 && largo >= 2) {
      fuentePorXf.push(u16(workbook, inicio));
    } else if (
      (tipo === 0x0009 || tipo === 0x0209 || tipo === 0x0409 || tipo === 0x0809)
      && largo >= 4
      && u16(workbook, inicio + 2) === 0x0010
    ) {
      hojaActual = indiceHojaPorOffset.get(offset) ?? siguienteHojaFisica;
      siguienteHojaFisica = Math.max(siguienteHojaFisica, hojaActual + 1);
    } else if (tipo === 0x000a) {
      hojaActual = null;
    } else if (hojaActual != null && REGISTROS_CELDA_XF.has(tipo) && largo >= 6) {
      marcar(u16(workbook, inicio), u16(workbook, inicio + 2), u16(workbook, inicio + 4));
    } else if (hojaActual != null && tipo === 0x00bd && largo >= 10) {
      // MulRk: fila, primera columna, pares (XF + RK), última columna.
      const fila = u16(workbook, inicio);
      const primera = u16(workbook, inicio + 2);
      const ultima = u16(workbook, fin - 2);
      for (let columna = primera; columna <= ultima; columna++) {
        const pos = inicio + 4 + (columna - primera) * 6;
        if (pos + 2 > fin - 2) break;
        marcar(fila, columna, u16(workbook, pos));
      }
    } else if (hojaActual != null && tipo === 0x00be && largo >= 8) {
      // MulBlank: fila, primera columna, lista de XF, última columna.
      const fila = u16(workbook, inicio);
      const primera = u16(workbook, inicio + 2);
      const ultima = u16(workbook, fin - 2);
      for (let columna = primera; columna <= ultima; columna++) {
        const pos = inicio + 4 + (columna - primera) * 2;
        if (pos + 2 > fin - 2) break;
        marcar(fila, columna, u16(workbook, pos));
      }
    }

    offset = fin;
  }

  return celdas;
}

/**
 * Lee un libro binario Excel 97-2003 (.xls/BIFF) a grillas por hoja.
 *
 * SheetJS se carga solo en esta rama: el flujo habitual .xlsx/.xlsm conserva
 * ExcelJS (incluida su señal de negrita) y no paga el costo de este parser.
 * Las macros o fórmulas no se ejecutan; se extraen únicamente los valores
 * almacenados en las celdas.
 */
async function leerLibroXls(data: ArrayBuffer): Promise<GridHoja[]> {
  const XLSX = await import("xlsx");
  const bytes = new Uint8Array(data);
  const wb = XLSX.read(bytes, {
    type: "array",
    raw: true,
    dense: true,
    sheetRows: 65_536,
    cellDates: false,
    cellFormula: false,
    cellHTML: false,
    bookVBA: false,
  });

  // Best-effort: un XLS válido sigue cargando aunque un productor BIFF exótico no
  // permita recuperar estilos. Nunca se sacrifica la lectura de valores por negrita.
  let negritasBiff: CeldasNegritaBiff = [];
  try {
    const cfb = XLSX.CFB.read(bytes, { type: "array" });
    const entrada = XLSX.CFB.find(cfb, "/Workbook") ?? XLSX.CFB.find(cfb, "/Book");
    const contenido = entrada?.content;
    if (contenido) negritasBiff = extraerCeldasNegritaBiffXls(new Uint8Array(contenido));
  } catch {
    negritasBiff = [];
  }

  return wb.SheetNames.map((nombre, indiceHoja) => {
    const ws = wb.Sheets[nombre];
    if (!ws) return { nombre, filas: [] };
    const ref = ws["!ref"];
    const rango = ref ? XLSX.utils.decode_range(ref) : null;
    const filasConHuecos = XLSX.utils
      .sheet_to_json<unknown[]>(ws, {
        header: 1,
        raw: true,
        defval: null,
        // Conserva huecos SOLO durante esta pasada para alinear la fila BIFF real
        // con la grilla; se filtran inmediatamente igual que antes.
        blankrows: true,
      });
    const filas: CeldaCruda[][] = [];
    const negrita: boolean[][] = [];
    let hayNegrita = false;
    const mapaHoja = negritasBiff[indiceHoja];
    for (let i = 0; i < filasConHuecos.length; i++) {
      const fila = filasConHuecos[i].map(celdaXls);
      if (!filaTieneDatos(fila)) continue;
      filas.push(fila);
      const filaBiff = (rango?.s.r ?? 0) + i;
      const primeraColumna = rango?.s.c ?? 0;
      const columnasBold = mapaHoja?.get(filaBiff);
      const flags = fila.map((_, j) => columnasBold?.has(primeraColumna + j) === true);
      if (flags.some(Boolean)) hayNegrita = true;
      negrita.push(flags);
    }
    return hayNegrita ? { nombre, filas, negrita } : { nombre, filas };
  });
}

function celdaXls(v: unknown): CeldaCruda {
  if (v == null) return null;
  if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") return v;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v);
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
      return { modo: "tabular", hojas: await leerLibroExcelTolerante(data) };
    case "xls": {
      try {
        return { modo: "tabular", hojas: await leerLibroXls(data) };
      } catch {
        throw new Error("No se pudo leer el archivo .xls. Verifica que sea un libro de Excel 97-2003 válido y que no tenga contraseña.");
      }
    }
    case "xlsb":
      throw new Error("El formato .xlsb no se procesa. Guarda el archivo como .xlsx, .xls o usa CSV, TXT, JSON o PDF.");
    default:
      // Último intento seguro: probar como OOXML moderno (.xlsx/.xlsm).
      try {
        return { modo: "tabular", hojas: await leerLibroExcelTolerante(data) };
      } catch {
        throw new Error("Formato de archivo no reconocido. Usa Excel (.xlsx/.xlsm/.xls), CSV, TXT (plano), JSON o PDF.");
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
 * - Las filas en negrita (Excel con estilo disponible) van marcadas `F12*:` — señal de agrupadora.
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
