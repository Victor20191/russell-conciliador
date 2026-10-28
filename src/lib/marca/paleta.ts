/**
 * Paleta y tipografía del Manual de Marca Corporativa de Russell Bedford, para lo
 * que se dibuja FUERA de las clases de Tailwind: hojas de Excel, el reporte para
 * gerencia (HTML, PDF y correo), los correos de notificación y los gráficos.
 *
 * Son exactamente los valores de `src/app/globals.css` (la prueba de este módulo
 * lo verifica): el color principal PAN 2748 RBI Space Blue, los cuatro
 * complementarios con sus tintes oficiales (80, 60, 40 y 20 %) y los neutros del
 * negro de proceso con que el manual compone su texto. No hay tonos más oscuros
 * que el 100 % de cada color.
 */

type Tintes = { readonly 100: string; readonly 80: string; readonly 60: string; readonly 40: string; readonly 20: string };

/** §3.1 Color principal: PAN 2748 RBI Space Blue. */
export const SPACE_BLUE: Tintes = { 100: "#001871", 80: "#33468D", 60: "#6674AA", 40: "#99A3C6", 20: "#CCD1E3" };
/** §3.2 PAN 3262 RBI Sea Green. */
export const SEA_GREEN: Tintes = { 100: "#00BFB3", 80: "#33CCC2", 60: "#66D9D1", 40: "#99E5E1", 20: "#CCF2F0" };
/** §3.2 PAN 144 RBI Earth Orange. */
export const EARTH_ORANGE: Tintes = { 100: "#ED8B00", 80: "#F1A233", 60: "#F4B966", 40: "#F8D199", 20: "#FBE8CC" };
/** §3.2 PAN 312 RBI Sky Blue. */
export const SKY_BLUE: Tintes = { 100: "#00A9CE", 80: "#33BAD8", 60: "#66CBE2", 40: "#99DDEB", 20: "#CCEEF5" };
/** §3.2 PAN 254 RBI Mind Magenta. */
export const MIND_MAGENTA: Tintes = { 100: "#981D97", 80: "#AD4AAC", 60: "#C177C1", 40: "#D6A5D5", 20: "#EAD2EA" };

/** Neutros: negro de proceso (K). El texto del manual es K90. */
export const NEUTRO = {
  k100: "#1D1D1B",
  k90: "#3C3C3B",
  k85: "#4A4A49",
  k80: "#575756",
  k75: "#626261",
  k70: "#6B6B6A",
  k40: "#B2B2B2",
  k20: "#DADADA",
  k15: "#E4E4E3",
  k10: "#EDEDED",
  k5: "#F6F6F6",
  k2: "#FBFBFB",
  blanco: "#FFFFFF",
} as const;

/**
 * Papeles de color para documentos y gráficos, con la misma lógica de la
 * interfaz: el texto va en neutro o en Space Blue (Sea Green, Earth Orange y Sky
 * Blue no son legibles como texto pequeño) y el error en Mind Magenta.
 */
export const COLOR = {
  marca: SPACE_BLUE[100],
  titulo: SPACE_BLUE[100],
  texto: NEUTRO.k90,
  textoFuerte: NEUTRO.k100,
  textoSecundario: NEUTRO.k75,
  borde: NEUTRO.k20,
  bordeSuave: NEUTRO.k15,
  fondoSuave: NEUTRO.k5,
  fondoEncabezado: SPACE_BLUE[20],
  exito: SEA_GREEN[100],
  exitoFondo: SEA_GREEN[20],
  advertencia: EARTH_ORANGE[100],
  advertenciaFondo: EARTH_ORANGE[20],
  error: MIND_MAGENTA[100],
  errorFondo: MIND_MAGENTA[20],
  info: SKY_BLUE[100],
  infoFondo: SKY_BLUE[20],
} as const;

/** Los cinco colores del manual al 100 %, en el orden en que se reparten en una gráfica. */
export const SERIE_GRAFICOS = [SPACE_BLUE[100], SEA_GREEN[100], EARTH_ORANGE[100], SKY_BLUE[100], MIND_MAGENTA[100]] as const;

/** Franja institucional (§5.1 membrete, §5.2 presentación): cuatro partes iguales, en este orden. */
export const FRANJA_MARCA = [SPACE_BLUE[100], MIND_MAGENTA[100], SEA_GREEN[100], EARTH_ORANGE[100]] as const;

/**
 * §2: Lato en pantalla y en lo impreso, con Arial como respaldo. Arial es además
 * la tipografía de los documentos editables (Excel) y del correo (§2.2), porque
 * quien los abre puede no tener Lato instalada.
 */
export const FUENTE_PANTALLA = "Lato, Arial, Helvetica, sans-serif";
export const FUENTE_EDITABLE = "Arial";
export const FUENTE_CORREO = "Arial, Helvetica, sans-serif";

/** `#RRGGBB` → `FFRRGGBB`, el formato ARGB que pide exceljs. */
export function argb(hex: string): string {
  const limpio = hex.replace("#", "").toUpperCase();
  if (!/^[0-9A-F]{6}$/.test(limpio)) throw new Error(`Color inválido: ${hex}`);
  return `FF${limpio}`;
}

/** Todos los colores admitidos (en mayúsculas, con #), para las pruebas de la guía. */
export const COLORES_ADMITIDOS: ReadonlySet<string> = new Set(
  [SPACE_BLUE, SEA_GREEN, EARTH_ORANGE, SKY_BLUE, MIND_MAGENTA]
    .flatMap((t) => [t[100], t[80], t[60], t[40], t[20]])
    .concat(Object.values(NEUTRO)),
);
