// Muestra de un patrón aprendido de un cargue: el ORIGINAL tal cual, cortado y con las personas
// ficticias (5/Oct/2026, decisiones del usuario) — sin BD.
//
// La muestra de una versión la descarga cualquiera que vea los patrones y sirve para reconocer el
// sistema y el reporte, así que se copia del original del cliente:
//  - la hoja del patrón con su formato —fondos, letras (tipo, tamaño, color, negrita), bordes,
//    alineación, formatos de número, anchos, altos y celdas combinadas— y el rótulo del reporte
//    completo (empresa, NIT, título, período, fecha, página): eso es lo que identifica el reporte;
//  - cortada en la fila de rótulos más las primeras `FILAS_DATOS_MUESTRA` filas de datos;
//  - con las PERSONAS (empleados, clientes, proveedores) cambiadas por ficticios que dicen qué iba
//    ahí: la identificación por `1111111001` (mismo largo) y el nombre por `PERSONA DUMMY 001`; el
//    mismo valor original da siempre el mismo ficticio. Las personas se reconocen por lo que lee el
//    MOTOR (`nit`, `cedula`, `tercero`, `nombre`, `empleado` de cada fila leída, también las
//    cabeceras de empleado de HGI y las de tercero de SIESA), no solo por las columnas mapeadas.
// Un .xlsx se copia exacto (se recorta el paquete y se carga con ExcelJS); un .xls se reconstruye
// con los estilos de su BIFF (`estilos-xls.ts`) y se guarda como .xlsx con el mismo nombre.
//
// La muestra se VERIFICA antes de devolverla: el patrón tiene que reconocerla, leerla fila por fila
// igual que esas filas del original y no puede quedar ninguna persona en sus filas de datos. Si algo
// no coincide, no hay muestra (el administrador sube una, como siempre).
import ExcelJS from "exceljs";
import { detectarFormato, ingerir, type GridHoja } from "@/lib/balance/extraccion/ingesta";
import { leerEstilosXls, type EstiloCeldaXls } from "@/lib/balance/extraccion/estilos-xls";
import type { DescriptorModulo } from "../descriptores";
import { aplicarPatronASpec } from "./aplicar";
import { mejorVersion, type VersionCandidata } from "./mejor-version";
import { revisarMapeoMuestra } from "./revision-mapeo";
import { normalizarRotulo } from "./rotulos";
import { FILAS_DATOS_MUESTRA } from "./version";

export { FILAS_DATOS_MUESTRA };

// ===== Personas =====

/** Claves de `datos` que el motor llena con la identidad de una persona. */
const CLAVES_PERSONA = ["nit", "cedula", "tercero", "nombre", "empleado"] as const;
const MIN_DIGITOS_ID = 5;

export type Personas = { ids: Set<string>; nombres: Set<string> };

/** Mayúsculas, sin tildes y con un solo espacio: así se comparan los nombres. */
function plegarTexto(texto: string): string {
  return texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/\s+/g, " ").trim();
}

/** El nombre sin la identificación, «CC/NIT» ni el rótulo «Total». */
function nombreDe(texto: string): string | null {
  const limpio = plegarTexto(
    texto
      .replace(/\b(?:C\.?\s?C|NIT|T\.?\s?I|C\.?\s?E|PPT|PEP)\b[:.]?/gi, " ")
      .replace(/[\d.,_/#:;()-]+/g, " "),
  ).replace(/^(?:SUB\s?)?TOTAL(?:ES)?\b\s*/, "").trim();
  return limpio.length >= 4 && /\p{L}/u.test(limpio) ? limpio : null;
}

/** Las personas que el motor reconoció en la lectura (identificaciones y nombres). */
export function personasDeLectura(filas: readonly { datos: Record<string, unknown> }[]): Personas {
  const ids = new Set<string>();
  const nombres = new Set<string>();
  for (const f of filas) {
    for (const clave of CLAVES_PERSONA) {
      const v = f.datos[clave];
      if (v == null || v === "") continue;
      const texto = String(v);
      for (const corrida of texto.match(new RegExp(`\\d{${MIN_DIGITOS_ID},}`, "g")) ?? []) ids.add(corrida);
      if (clave !== "nit" && clave !== "cedula") {
        const nombre = nombreDe(texto);
        if (nombre) nombres.add(nombre);
      }
    }
  }
  return { ids, nombres };
}

/**
 * Prefijo del nombre ficticio. NO puede contener el rótulo de ningún rol de ningún módulo: el
 * motor reconoce un encabezado repetido por dos columnas mapeadas que nombran su propio rol, y
 * con «NOMBRE DUMMY» (rótulo del empleado y del tercero) más el «…DE AREA» del centro de costo,
 * las filas de NOMINAI se leían como encabezado y la muestra perdía 80 de sus 100 filas.
 */
export const PREFIJO_NOMBRE_FICTICIO = "PERSONA DUMMY";

/** Ficticios consistentes: el mismo valor original da siempre el mismo reemplazo. */
export class Ficticios {
  private readonly porId = new Map<string, string>();
  private readonly porNombre = new Map<string, string>();

  /** `1022093434` → `1111111001`: mismo largo, unos y un consecutivo de tres dígitos. */
  id(original: string): string {
    const previo = this.porId.get(original);
    if (previo) return previo;
    const n = String(this.porId.size + 1).padStart(3, "0");
    const ficticio = "1".repeat(Math.max(0, original.length - n.length)) + n;
    this.porId.set(original, ficticio);
    return ficticio;
  }

  nombre(plegado: string): string {
    const previo = this.porNombre.get(plegado);
    if (previo) return previo;
    const ficticio = `${PREFIJO_NOMBRE_FICTICIO} ${String(this.porNombre.size + 1).padStart(3, "0")}`;
    this.porNombre.set(plegado, ficticio);
    return ficticio;
  }
}

/** El texto plegado con, para cada carácter, su posición en el original. */
function plegarConPosiciones(texto: string): { plegado: string; pos: number[] } {
  let plegado = "";
  const pos: number[] = [];
  let espacio = false;
  for (let i = 0; i < texto.length; i++) {
    const ch = texto[i];
    if (/\s/.test(ch)) {
      if (!espacio && plegado.length > 0) { plegado += " "; pos.push(i); }
      espacio = true;
      continue;
    }
    espacio = false;
    for (const c of ch.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase()) { plegado += c; pos.push(i); }
  }
  return { plegado, pos };
}

const esLetra = (c: string | undefined) => c != null && /[\p{L}\p{N}]/u.test(c);

/**
 * Las personas de un texto, cambiadas por sus ficticios: cada corrida de dígitos conocida y cada
 * nombre conocido (igual a la celda, o contenido si tiene dos palabras o más). El resto del texto
 * —«CC », «-1», «Total »— queda como estaba.
 */
export function anonimizarTexto(texto: string, personas: Personas, ficticios: Ficticios): string {
  let t = texto.replace(new RegExp(`\\d{${MIN_DIGITOS_ID},}`, "g"), (corrida) => (personas.ids.has(corrida) ? ficticios.id(corrida) : corrida));
  const nombres = [...personas.nombres].sort((a, b) => b.length - a.length);
  for (const nombre of nombres) {
    const varias = nombre.includes(" ");
    for (let vuelta = 0; vuelta < 20; vuelta++) {
      const { plegado, pos } = plegarConPosiciones(t);
      const idx = plegado.indexOf(nombre);
      if (idx < 0) break;
      const completo = idx === 0 && plegado.trimEnd().length === nombre.length;
      const bordes = !esLetra(plegado[idx - 1]) && !esLetra(plegado[idx + nombre.length]);
      if (!bordes || (!varias && !completo)) break;
      const desde = pos[idx];
      const hasta = pos[idx + nombre.length - 1] + 1;
      t = t.slice(0, desde) + ficticios.nombre(nombre) + t.slice(hasta);
    }
  }
  return t;
}

/** Cambia las personas de las filas `[desde, hasta]` de la hoja; el estilo de cada celda no cambia. */
export function anonimizarHoja(ws: ExcelJS.Worksheet, personas: Personas, ficticios: Ficticios, desde: number, hasta: number): void {
  const texto = (v: string) => anonimizarTexto(v, personas, ficticios);
  for (let r = desde; r <= hasta; r++) {
    const row = ws.findRow(r);
    if (!row) continue;
    row.eachCell({ includeEmpty: false }, (cell) => {
      const v = cell.value;
      if (typeof v === "string") {
        const nuevo = texto(v);
        if (nuevo !== v) cell.value = nuevo;
      } else if (typeof v === "number") {
        if (Number.isInteger(v) && personas.ids.has(String(Math.abs(v)))) cell.value = Number(ficticios.id(String(Math.abs(v)))) * Math.sign(v);
      } else if (v && typeof v === "object") {
        if ("richText" in v && Array.isArray(v.richText)) {
          const runs = v.richText.map((run) => ({ ...run, text: texto(run.text) }));
          const unido = v.richText.map((run) => run.text).join("");
          const unidoNuevo = texto(unido);
          if (runs.map((run) => run.text).join("") === unidoNuevo) {
            if (unidoNuevo !== unido) cell.value = { richText: runs };
          } else cell.value = unidoNuevo; // un nombre partido entre fragmentos: queda en texto plano
        } else if ("formula" in v || "sharedFormula" in v) {
          const resultado = (v as { result?: unknown }).result;
          if (typeof resultado === "string" && texto(resultado) !== resultado) cell.value = texto(resultado);
          else if (typeof resultado === "number" && Number.isInteger(resultado) && personas.ids.has(String(Math.abs(resultado)))) {
            cell.value = Number(ficticios.id(String(Math.abs(resultado)))) * Math.sign(resultado);
          }
        } else if ("hyperlink" in v && typeof (v as { text?: unknown }).text === "string") {
          const t = (v as { text: string }).text;
          if (texto(t) !== t) cell.value = { ...(v as object), text: texto(t) } as ExcelJS.CellHyperlinkValue;
        }
      }
    });
  }
}

/**
 * La fila (1-based, de la grilla) con los rótulos de la versión: la que más rótulos comparte con su
 * encabezado guardado. Algunas versiones guardaron la fila del encabezado con la numeración física
 * del archivo y apuntan a una fila de datos; los rótulos no mienten.
 */
export function filaConRotulos(hoja: GridHoja, rotulos: readonly unknown[], hasta: number): number | null {
  const buscados = new Set(rotulos.map((r) => normalizarRotulo(String(r ?? ""))).filter(Boolean));
  if (buscados.size === 0) return null;
  let mejor: { fila: number; aciertos: number } | null = null;
  for (let i = 0; i < Math.min(hasta, hoja.filas.length); i++) {
    const enFila = new Set((hoja.filas[i] ?? []).map((c) => normalizarRotulo(String(c ?? ""))).filter(Boolean));
    let aciertos = 0;
    for (const r of buscados) if (enFila.has(r)) aciertos++;
    if (aciertos > (mejor?.aciertos ?? 0)) mejor = { fila: i + 1, aciertos };
  }
  return mejor && mejor.aciertos >= Math.min(2, buscados.size) ? mejor.fila : null;
}

// ===== Copia del original =====

const argb = (rgb: string) => `FF${rgb.toUpperCase()}`;

function decodificarXml(s: string): string {
  return s.replace(/&quot;/g, "\"").replace(/&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}

const atributo = (etiqueta: string, nombre: string): string | null =>
  new RegExp(`\\s${nombre}="([^"]*)"`).exec(etiqueta)?.[1] ?? null;

/** La última fila que toca una referencia («B5», «A1:F2»). */
const ultimaFilaDe = (ref: string): number =>
  Math.max(0, ...ref.split(/[\s:]+/).map((parte) => Number(/(\d+)$/.exec(parte)?.[1] ?? 0)));

/** Quita de un bloque (`<mergeCells>`, `<hyperlinks>`) los elementos que pasan de la fila `corte`. */
function quitarRangosDespuesDe(xml: string, bloque: string, elemento: string, corte: number): string {
  const m = new RegExp(`(<(?:\\w+:)?${bloque}\\b[^>]*>)([\\s\\S]*?)(</(?:\\w+:)?${bloque}>)`).exec(xml);
  if (!m) return xml;
  const reElemento = new RegExp(`<(?:\\w+:)?${elemento}\\b[^>]*?(?:/>|>[\\s\\S]*?</(?:\\w+:)?${elemento}>)`, "g");
  const quedan = [...m[2].matchAll(reElemento)].map((e) => e[0]).filter((e) => ultimaFilaDe(atributo(e, "ref") ?? "") <= corte);
  const nuevo = quedan.length === 0 ? "" : m[1].replace(/\scount="\d+"/, ` count="${quedan.length}"`) + quedan.join("") + m[3];
  return xml.slice(0, m.index) + nuevo + xml.slice(m.index + m[0].length);
}

/**
 * Corta en el XML de una hoja los `<row>` posteriores a `corte` (con `corte` 0 deja la hoja vacía)
 * y, con ellos, las celdas combinadas y los hipervínculos de esas filas: ExcelJS tarda en cargar
 * cada combinada (un inventario de SAP B1 trae 17.719 y la carga pasaba de 20 s).
 */
export function cortarFilasXml(xml: string, corte: number): string {
  let cortado = xml;
  const apertura = /<(?:\w+:)?sheetData\b[^>]*?(\/?)>/.exec(xml);
  if (apertura && apertura[1] !== "/") {
    const inicioDatos = apertura.index + apertura[0].length;
    const cierre = /<\/(?:\w+:)?sheetData>/g;
    cierre.lastIndex = inicioDatos;
    const fin = cierre.exec(xml);
    const reFila = /<(?:\w+:)?row\b([^>]*?)\/?>/g;
    reFila.lastIndex = inicioDatos;
    let anterior = 0;
    for (let m = fin ? reFila.exec(xml) : null; fin && m && m.index < fin.index; m = reFila.exec(xml)) {
      const r = /\sr="(\d+)"/.exec(m[1]);
      const numero = r ? Number(r[1]) : anterior + 1;
      anterior = numero;
      if (numero > corte) {
        cortado = xml.slice(0, m.index) + xml.slice(fin.index);
        break;
      }
    }
  }
  return quitarRangosDespuesDe(quitarRangosDespuesDe(cortado, "mergeCells", "mergeCell", corte), "hyperlinks", "hyperlink", corte);
}

/** Un .xlsx/.xlsm copiado EXACTO: solo la hoja del patrón, hasta la fila física `corte`. */
async function copiarXlsx(bytes: Uint8Array, nombreHoja: string, corte: number): Promise<{ wb: ExcelJS.Workbook; ws: ExcelJS.Worksheet }> {
  const { default: JSZip } = await import("jszip");
  const zip = await JSZip.loadAsync(bytes);
  const libroXml = (await zip.file("xl/workbook.xml")?.async("string")) ?? "";
  const relsXml = (await zip.file("xl/_rels/workbook.xml.rels")?.async("string")) ?? "";
  const destinos = new Map<string, string>();
  for (const [etiqueta] of relsXml.matchAll(/<(?:\w+:)?Relationship\b[^>]*>/g)) {
    const id = atributo(etiqueta, "Id");
    const destino = atributo(etiqueta, "Target");
    if (id && destino) destinos.set(id, destino.startsWith("/") ? destino.slice(1) : `xl/${destino.replace(/^\.\//, "")}`);
  }
  // Las demás hojas quedan vacías antes de cargar: el libro pesa lo que la muestra, no lo que el original.
  for (const [etiqueta] of libroXml.matchAll(/<(?:\w+:)?sheet\b[^>]*>/g)) {
    const nombre = decodificarXml(atributo(etiqueta, "name") ?? "");
    const rid = /\s(?:\w+:)?id="([^"]+)"/.exec(etiqueta)?.[1];
    const ruta = rid ? destinos.get(rid) : undefined;
    const archivo = ruta ? zip.file(ruta) : null;
    if (!archivo || !ruta) continue;
    zip.file(ruta, cortarFilasXml(await archivo.async("string"), nombre === nombreHoja ? corte : 0));
  }
  const reducido = await zip.generateAsync({ type: "uint8array" });
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(reducido.buffer.slice(reducido.byteOffset, reducido.byteOffset + reducido.byteLength) as ArrayBuffer);
  const ws = wb.getWorksheet(nombreHoja);
  if (!ws) throw new Error(`El original no tiene la hoja «${nombreHoja}».`);
  for (const otra of wb.worksheets.filter((w) => w.id !== ws.id)) wb.removeWorksheet(otra.id);
  // Lo que apunta a las hojas quitadas o a filas cortadas.
  wb.definedNames.model = [];
  for (const rango of [...(ws.model.merges ?? [])]) {
    const fila = Number(/(\d+)$/.exec(rango)?.[1] ?? 0);
    if (fila > corte) ws.unMergeCells(rango);
  }
  for (const nombre of Object.keys((ws as unknown as { tables?: Record<string, unknown> }).tables ?? {})) {
    try { ws.removeTable(nombre); } catch { /* la tabla ya no está */ }
  }
  if (typeof ws.autoFilter === "string") ws.autoFilter = ws.autoFilter.replace(/(\d+)$/, (n) => String(Math.min(Number(n), corte)));
  ws.state = "visible";
  for (const vista of wb.views ?? []) Object.assign(vista, { activeTab: 0, firstSheet: 0 });
  return { wb, ws };
}

function aplicarEstiloXls(celda: ExcelJS.Cell, e: EstiloCeldaXls): void {
  const f = e.fuente;
  celda.font = {
    ...(f.nombre ? { name: f.nombre } : {}),
    ...(f.tamano ? { size: f.tamano } : {}),
    ...(f.negrita ? { bold: true } : {}),
    ...(f.cursiva ? { italic: true } : {}),
    ...(f.tachado ? { strike: true } : {}),
    ...(f.subrayado ? { underline: f.subrayado } : {}),
    ...(f.color ? { color: { argb: argb(f.color) } } : {}),
  };
  if (e.relleno) {
    celda.fill = {
      type: "pattern",
      pattern: e.relleno.patron as ExcelJS.FillPatterns,
      ...(e.relleno.color ? { fgColor: { argb: argb(e.relleno.color) } } : {}),
      ...(e.relleno.fondo ? { bgColor: { argb: argb(e.relleno.fondo) } } : {}),
    };
  }
  if (e.bordes) {
    const lado = (b?: { estilo: string; color?: string }): Partial<ExcelJS.Border> | undefined =>
      b ? { style: b.estilo as ExcelJS.BorderStyle, ...(b.color ? { color: { argb: argb(b.color) } } : {}) } : undefined;
    celda.border = {
      ...(e.bordes.left ? { left: lado(e.bordes.left) } : {}),
      ...(e.bordes.right ? { right: lado(e.bordes.right) } : {}),
      ...(e.bordes.top ? { top: lado(e.bordes.top) } : {}),
      ...(e.bordes.bottom ? { bottom: lado(e.bordes.bottom) } : {}),
    };
  }
  if (e.alineacion) {
    const a = e.alineacion;
    celda.alignment = {
      ...(a.horizontal ? { horizontal: a.horizontal as ExcelJS.Alignment["horizontal"] } : {}),
      ...(a.vertical ? { vertical: a.vertical as ExcelJS.Alignment["vertical"] } : {}),
      ...(a.ajustar ? { wrapText: true } : {}),
      ...(a.rotacion ? { textRotation: a.rotacion } : {}),
      ...(a.sangria ? { indent: a.sangria } : {}),
    };
  }
}

/**
 * Un .xls (o .xlsb) reconstruido en las MISMAS celdas: valores, formato de número, anchos, altos y
 * combinadas de SheetJS; letras, fondos, bordes y alineación del BIFF (.xls). Hasta la fila `corte`.
 */
async function copiarConSheetJS(bytes: Uint8Array, nombreHoja: string, corte: number, conEstilosBiff: boolean): Promise<{ wb: ExcelJS.Workbook; ws: ExcelJS.Worksheet }> {
  const XLSX = await import("xlsx");
  const libro = XLSX.read(bytes, {
    type: "array", sheets: [nombreHoja], sheetRows: corte, cellNF: true, cellStyles: true,
    cellDates: false, cellFormula: false, cellHTML: false, bookVBA: false,
  });
  const hoja = libro.Sheets[nombreHoja];
  if (!hoja) throw new Error(`El original no tiene la hoja «${nombreHoja}».`);
  const indiceHoja = libro.SheetNames.indexOf(nombreHoja);
  const estilos = conEstilosBiff ? await leerEstilosXls(bytes) : null;
  const xfDe = (r: number, c: number) => estilos?.hojas[indiceHoja]?.get(r)?.get(c);

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(nombreHoja.slice(0, 31) || "Hoja1");
  const ponerEstilo = (celda: ExcelJS.Cell, r: number, c: number, s?: { patternType?: string; fgColor?: { rgb?: string } }) => {
    const xf = xfDe(r, c);
    if (xf != null && estilos?.xf[xf]) aplicarEstiloXls(celda, estilos.xf[xf]);
    else if (s?.patternType === "solid" && s.fgColor?.rgb) celda.fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb(s.fgColor.rgb) } };
  };
  const vistas = new Set<string>();
  const rango = hoja["!ref"] ? XLSX.utils.decode_range(hoja["!ref"]) : null;
  if (rango) {
    for (let r = rango.s.r; r <= Math.min(rango.e.r, corte - 1); r++) {
      for (let c = rango.s.c; c <= rango.e.c; c++) {
        const origen = hoja[XLSX.utils.encode_cell({ r, c })] as { t?: string; v?: unknown; w?: string; z?: unknown; s?: { patternType?: string; fgColor?: { rgb?: string } } } | undefined;
        if (!origen && xfDe(r, c) == null) continue;
        const celda = ws.getCell(r + 1, c + 1);
        vistas.add(`${r}:${c}`);
        if (origen) {
          if (origen.t === "n" && typeof origen.v === "number") celda.value = origen.v;
          else if (origen.t === "b") celda.value = origen.v === true;
          else if (origen.t === "e") celda.value = origen.w ?? null;
          else if (origen.v != null) celda.value = String(origen.v);
          if (typeof origen.z === "string" && origen.z !== "General") celda.numFmt = origen.z;
        }
        ponerEstilo(celda, r, c, origen?.s);
      }
    }
  }
  // Celdas vacías con formato fuera del rango de valores (la franja gris de un encabezado).
  for (const [r, columnas] of estilos?.hojas[indiceHoja] ?? []) {
    if (r >= corte) continue;
    for (const [c] of columnas) if (!vistas.has(`${r}:${c}`)) ponerEstilo(ws.getCell(r + 1, c + 1), r, c);
  }
  (hoja["!cols"] ?? []).forEach((col: { width?: number; wch?: number; hidden?: boolean } | undefined, i: number) => {
    if (!col) return;
    const columna = ws.getColumn(i + 1);
    const ancho = col.width ?? col.wch;
    if (ancho) columna.width = ancho;
    if (col.hidden) columna.hidden = true;
  });
  (hoja["!rows"] ?? []).forEach((fila: { hpt?: number; hidden?: boolean } | undefined, i: number) => {
    if (!fila || i >= corte) return;
    if (fila.hpt) ws.getRow(i + 1).height = fila.hpt;
    if (fila.hidden) ws.getRow(i + 1).hidden = true;
  });
  for (const m of hoja["!merges"] ?? []) {
    if (m.e.r >= corte) continue;
    try { ws.mergeCells(m.s.r + 1, m.s.c + 1, m.e.r + 1, m.e.c + 1); } catch { /* combinadas superpuestas: se omite */ }
  }
  return { wb, ws };
}

/** Un CSV: los valores en sus filas, sin formato que copiar. */
function copiarDeGrilla(hoja: GridHoja, corte: number): { wb: ExcelJS.Workbook; ws: ExcelJS.Worksheet } {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(hoja.nombre.slice(0, 31) || "Hoja1");
  hoja.filas.forEach((fila, i) => {
    const fisica = hoja.filasFisicas?.[i] ?? i + 1;
    if (fisica > corte) return;
    (fila ?? []).forEach((v, c) => { if (v != null && v !== "") ws.getCell(fisica, c + 1 + (hoja.columnaInicial ?? 0)).value = v; });
  });
  return { wb, ws };
}

/** El nombre de la muestra: el del original; un .xls/.xlsb/.xlsm/.csv se guarda como .xlsx. */
export function nombreDeMuestra(nombreOriginal: string): string {
  return /\.xlsx$/i.test(nombreOriginal) ? nombreOriginal : `${nombreOriginal.replace(/\.[^.]+$/, "")}.xlsx`;
}

// ===== Generación verificada =====

type FilaComparable = { filaNum: number; tipoFila: string; clasificador: string; valor: number };
const comparables = (filas: readonly { filaNum: number; tipoFila: string; clasificador: string | null; valor: number }[]): FilaComparable[] =>
  filas.map((f) => ({ filaNum: f.filaNum, tipoFila: f.tipoFila, clasificador: f.clasificador ?? "", valor: Math.round(f.valor * 100) / 100 }));

/** ¿Queda alguna persona conocida en las filas de datos de la grilla? */
function quedaPersona(hoja: GridHoja, desdeFisica: number, personas: Personas): boolean {
  return hoja.filas.some((fila, i) => {
    if ((hoja.filasFisicas?.[i] ?? i + 1) <= desdeFisica) return false;
    return (fila ?? []).some((c) => {
      if (c == null || c === "") return false;
      const texto = String(c);
      if ((texto.match(new RegExp(`\\d{${MIN_DIGITOS_ID},}`, "g")) ?? []).some((corrida) => personas.ids.has(corrida))) return true;
      const plegado = plegarTexto(texto);
      return [...personas.nombres].some((n) => plegado === n || (n.includes(" ") && plegado.includes(n)));
    });
  });
}

export type OriginalMuestra = { bytes: Uint8Array; nombre: string };

export type ResultadoMuestraRecortada =
  | { ok: true; bytes: Uint8Array; nombre: string; filasDatos: number }
  | { ok: false; motivo: string };

/**
 * Genera y VERIFICA la muestra de una versión a partir del original (sus bytes y la hoja que ya
 * leyó la ingesta): el patrón tiene que reconocerla y leerla fila por fila igual que esas filas del
 * original, y no puede quedar ninguna persona en sus filas de datos.
 */
export async function generarMuestraRecortada(
  descriptor: DescriptorModulo,
  original: OriginalMuestra,
  hojaOriginal: GridHoja,
  version: VersionCandidata,
): Promise<ResultadoMuestraRecortada> {
  const ubicacion = mejorVersion(descriptor, [hojaOriginal], [version], { hojaElegida: hojaOriginal.nombre });
  if (!ubicacion?.coincidencia.elegible) return { ok: false, motivo: "El patrón no reconoce el original." };
  const spec = aplicarPatronASpec(descriptor, ubicacion, hojaOriginal).spec;
  if (hojaOriginal.filas.length < spec.primeraFilaDatos) return { ok: false, motivo: "El original no tiene filas de datos." };
  const hasta = Math.min(hojaOriginal.filas.length, spec.primeraFilaDatos - 1 + FILAS_DATOS_MUESTRA);
  const fisica = (i: number) => hojaOriginal.filasFisicas?.[i] ?? i + 1;
  const referencia: GridHoja = {
    ...hojaOriginal,
    filas: hojaOriginal.filas.slice(0, hasta),
    ...(hojaOriginal.negrita ? { negrita: hojaOriginal.negrita.slice(0, hasta) } : {}),
    ...(hojaOriginal.filasFisicas ? { filasFisicas: hojaOriginal.filasFisicas.slice(0, hasta) } : {}),
  };
  const esperada = revisarMapeoMuestra(descriptor, [referencia], spec, { exigirTipoFormato: true });
  if (esperada.impedimentos.length > 0 || !esperada.lectura) {
    return { ok: false, motivo: `Las primeras ${FILAS_DATOS_MUESTRA} filas del original no sirven de muestra: ${esperada.impedimentos[0] ?? "no se pudieron leer"}` };
  }
  const personas = personasDeLectura(esperada.lectura.filas);
  const filaRotulos = filaConRotulos(hojaOriginal, version.encabezado, Math.max(spec.filaEncabezado, ubicacion.filaEncabezado) + 1) ?? spec.filaEncabezado;
  const rotulosFisica = fisica(filaRotulos - 1);
  const corte = fisica(hasta - 1);

  const copiaBytes = original.bytes.slice();
  const formato = detectarFormato(original.nombre, copiaBytes.buffer as ArrayBuffer);
  let copia: { wb: ExcelJS.Workbook; ws: ExcelJS.Worksheet };
  try {
    copia = formato === "xlsx"
      ? await copiarXlsx(copiaBytes, hojaOriginal.nombre, corte)
      : formato === "xls" || formato === "xlsb"
        ? await copiarConSheetJS(copiaBytes, hojaOriginal.nombre, corte, formato === "xls")
        : copiarDeGrilla(hojaOriginal, corte);
  } catch (e) {
    return { ok: false, motivo: `No se pudo copiar el original: ${e instanceof Error ? e.message : String(e)}` };
  }
  anonimizarHoja(copia.ws, personas, new Ficticios(), rotulosFisica + 1, corte);
  const bytes = new Uint8Array(await copia.wb.xlsx.writeBuffer());

  const nombre = nombreDeMuestra(original.nombre);
  const ingesta = await ingerir(bytes.slice().buffer as ArrayBuffer, nombre);
  if (ingesta.modo !== "tabular") return { ok: false, motivo: "La muestra generada no se pudo leer." };
  const hojaMuestra = ingesta.hojas.find((h) => h.nombre === copia.ws.name) ?? ingesta.hojas[0];
  const ubicacionMuestra = hojaMuestra ? mejorVersion(descriptor, [hojaMuestra], [version], { hojaElegida: hojaMuestra.nombre }) : null;
  if (!hojaMuestra || !ubicacionMuestra?.coincidencia.elegible) return { ok: false, motivo: "El patrón no reconoce la muestra." };
  const obtenida = revisarMapeoMuestra(descriptor, [hojaMuestra], aplicarPatronASpec(descriptor, ubicacionMuestra, hojaMuestra).spec, { exigirTipoFormato: true });
  if (obtenida.impedimentos.length > 0 || !obtenida.lectura) {
    return { ok: false, motivo: `La muestra no se lee igual: ${obtenida.impedimentos[0] ?? "sin lectura"}` };
  }
  const a = comparables(esperada.lectura.filas);
  const b = comparables(obtenida.lectura.filas);
  const distinta = a.length !== b.length || a.some((f, i) => {
    const g = b[i];
    return f.filaNum !== g.filaNum || f.tipoFila !== g.tipoFila || f.clasificador !== g.clasificador || f.valor !== g.valor;
  });
  if (distinta) return { ok: false, motivo: "Con las personas ficticias la muestra se lee distinto (el formato depende de esos datos)." };
  if (quedaPersona(hojaMuestra, rotulosFisica, personas)) return { ok: false, motivo: "Quedó el dato de una persona en la muestra." };
  return { ok: true, bytes, nombre, filasDatos: hasta - (spec.primeraFilaDatos - 1) };
}
