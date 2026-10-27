import type ExcelJS from "exceljs";
import JSZip from "jszip";
import { colorDeMarcaMasCercano } from "@/lib/marca/html";
import {
  argb,
  EARTH_ORANGE,
  FUENTE_EDITABLE,
  MIND_MAGENTA,
  NEUTRO,
  SEA_GREEN,
  SPACE_BLUE,
} from "@/lib/marca/paleta";

/**
 * Marca para las hojas de cálculo que genera la plataforma (exportaciones y
 * plantillas). Un Excel es un documento EDITABLE: el Manual de Marca (§2.2) pide
 * Arial, porque quien lo abre puede no tener Lato. Los colores, los del manual.
 */
export const EXCEL = {
  encabezado: argb(SPACE_BLUE[100]),
  encabezadoSecundario: argb(SPACE_BLUE[80]),
  textoEncabezado: argb(NEUTRO.blanco),
  titulo: argb(SPACE_BLUE[100]),
  texto: argb(NEUTRO.k90),
  textoSecundario: argb(NEUTRO.k70),
  textoApagado: argb(NEUTRO.k40),
  error: argb(MIND_MAGENTA[100]),
  borde: argb(NEUTRO.k20),
  fondo: argb(NEUTRO.blanco),
  cebra: argb(NEUTRO.k5),
  nivel1: argb(SPACE_BLUE[40]),
  nivel2: argb(SPACE_BLUE[20]),
  nivel3: argb(NEUTRO.k5),
  exito: argb(SEA_GREEN[20]),
  advertencia: argb(EARTH_ORANGE[20]),
  apagado: argb(NEUTRO.k10),
} as const;

export function rellenoMarca(color: string): ExcelJS.Fill {
  return { type: "pattern", pattern: "solid", fgColor: { argb: color } };
}

/** Encabezado de tabla: Space Blue con texto blanco en negrita. */
export function estiloEncabezado(destino: ExcelJS.Row | ExcelJS.Cell, color: string = EXCEL.encabezado): void {
  destino.font = { bold: true, color: { argb: EXCEL.textoEncabezado } };
  destino.fill = rellenoMarca(color);
}

/** `rgb="AARRGGBB"` → el color del manual más parecido, con su misma opacidad. */
function rgbDeMarca(xml: string): string {
  return xml.replace(/\brgb="([0-9A-Fa-f]{2})([0-9A-Fa-f]{6})"/g, (_, alfa: string, hex: string) => {
    const rgb: [number, number, number] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
    return `rgb="${alfa.toUpperCase()}${argb(colorDeMarcaMasCercano(rgb)).slice(2)}"`;
  });
}

/**
 * Cada fuente del libro en Arial, con el texto en el gris del manual cuando no
 * trae color propio. Las fuentes «del tema» de Excel dejan de serlo.
 */
function fuentesDeMarca(xml: string, etiqueta: "font" | "rPr"): string {
  return xml.replace(new RegExp(`<${etiqueta}\\s*/>`, "g"), `<${etiqueta}></${etiqueta}>`).replace(new RegExp(`<${etiqueta}>([\\s\\S]*?)</${etiqueta}>`, "g"), (_, cuerpo: string) => {
    let c = cuerpo
      .replace(/<scheme\b[^>]*\/>/g, "")
      .replace(/<(?:name|rFont)\b[^>]*\/>/g, "")
      .replace(/<family\b[^>]*\/>/g, "")
      .replace(/<color\s+theme="[^"]*"(?:\s+tint="[^"]*")?\s*\/>/g, `<color rgb="${EXCEL.texto}"/>`);
    if (!/<color\b/.test(c)) c += `<color rgb="${EXCEL.texto}"/>`;
    const nombre = etiqueta === "font" ? `<name val="${FUENTE_EDITABLE}"/>` : `<rFont val="${FUENTE_EDITABLE}"/>`;
    return `<${etiqueta}>${c}${nombre}<family val="2"/></${etiqueta}>`;
  });
}

/**
 * Escribe el libro con la marca. Ajusta el `styles.xml` (y los textos con
 * formato) en vez de cada celda, así el costo no depende del número de filas:
 * todas las fuentes —también la «Normal», que usará lo que se escriba después
 * en una celda vacía— quedan en Arial, y todo color de relleno, borde o texto
 * en el más parecido de la paleta del manual.
 */
export async function escribirLibroMarca(wb: ExcelJS.Workbook): Promise<Buffer> {
  const crudo = Buffer.from(await wb.xlsx.writeBuffer());
  const zip = await JSZip.loadAsync(crudo);
  // Solo se reescribe lo que cambia: JSZip reutiliza la compresión del resto (la hoja
  // de una exportación grande no se vuelve a comprimir).
  let cambio = false;
  for (const [ruta, etiqueta] of [["xl/styles.xml", "font"], ["xl/sharedStrings.xml", "rPr"]] as const) {
    const archivo = zip.file(ruta);
    if (!archivo) continue;
    const xml = await archivo.async("string");
    const ajustado = rgbDeMarca(fuentesDeMarca(xml, etiqueta));
    if (ajustado !== xml) {
      zip.file(ruta, ajustado);
      cambio = true;
    }
  }
  if (!cambio) return crudo;
  return Buffer.from(await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }));
}
