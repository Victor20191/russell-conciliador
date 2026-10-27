/**
 * Piezas de marca para el HTML que la plataforma GENERA (reporte para gerencia,
 * reporte de novedades, correos): el logotipo oficial, la franja institucional,
 * la tipografía y un ajuste que lleva cualquier color a la paleta del manual.
 *
 * Puro y sin `server-only`: lo usan el servidor (PDF, correos) y el navegador
 * (copia del reporte para pegar en un correo).
 */

import {
  COLORES_ADMITIDOS,
  EARTH_ORANGE,
  FRANJA_MARCA,
  FUENTE_CORREO,
  FUENTE_PANTALLA,
  MIND_MAGENTA,
  NEUTRO,
  SEA_GREEN,
  SKY_BLUE,
  SPACE_BLUE,
} from "./paleta";
import { glifosDeMarca, glifosSoloLato } from "./glifos";

/**
 * Logotipo oficial en `public/marca`: el SVG del PDF vectorial (pantalla, HTML y PDF)
 * y su PNG oficial de 600 px para el correo, que no muestra SVG (Gmail, Outlook).
 */
export const RUTA_LOGO_AZUL = "/marca/russell-bedford-azul.svg";
export const RUTA_LOGO_BLANCO = "/marca/russell-bedford-blanco.svg";
const PNG_CORREO: Record<string, string> = {
  "/marca/russell-bedford-azul.svg": "/marca/russell-bedford-azul-600.png",
  "/marca/russell-bedford-blanco.svg": "/marca/russell-bedford-blanco-600.png",
};
const PROPORCION_LOGO = 89.5 / 412.6;

/** Fuentes Lato servidas por la propia plataforma (`public/marca/fuentes`). */
export const FUENTES_LATO = [
  { archivo: "lato-300-normal.woff2", peso: 300, estilo: "normal" },
  { archivo: "lato-400-normal.woff2", peso: 400, estilo: "normal" },
  { archivo: "lato-400-italic.woff2", peso: 400, estilo: "italic" },
  { archivo: "lato-700-normal.woff2", peso: 700, estilo: "normal" },
  { archivo: "lato-700-italic.woff2", peso: 700, estilo: "italic" },
  { archivo: "lato-900-normal.woff2", peso: 900, estilo: "normal" },
] as const;
export const RUTA_FUENTES = "/marca/fuentes/";

/** `@font-face` de Lato con las rutas de la plataforma (el PDF las cambia por datos incrustados). */
export function cssFuentesLato(rutaDe: (archivo: string) => string = (a) => `${RUTA_FUENTES}${a}`): string {
  return FUENTES_LATO.map(
    (f) =>
      `@font-face{font-family:Lato;font-style:${f.estilo};font-weight:${f.peso};font-display:swap;src:url(${rutaDe(f.archivo)}) format("woff2")}`,
  ).join("");
}

function escapeAtributo(texto: string): string {
  return texto.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

/**
 * Logotipo oficial como imagen (§1): nombre, símbolo y eslogan juntos, sin
 * redibujar. Ancho mínimo 30 mm (≈ 114 px) y espacio libre del 20 % de su ancho
 * por arriba, abajo y a la derecha; a la izquierda lo da el margen del documento.
 */
export function logoHtml({
  src = RUTA_LOGO_AZUL,
  ancho = 180,
}: {
  src?: string;
  ancho?: number;
} = {}): string {
  const w = Math.max(114, Math.round(ancho));
  const h = Math.round(w * PROPORCION_LOGO);
  const libre = Math.ceil(w * 0.2);
  return `<div class="rb-logo" style="padding:${libre}px ${libre}px ${libre}px 0;line-height:0"><img src="${escapeAtributo(src)}" width="${w}" height="${h}" alt="Russell Bedford · taking you further" style="display:block;width:${w}px;height:${h}px;border:0"></div>`;
}

/**
 * Franja institucional de cuatro colores (§5.1 y §5.2), en una tabla: es lo que
 * conservan Gmail y Outlook al pegar (un degradado o un `div` vacío se pierden).
 */
export function franjaHtml(alto = 4): string {
  const celdas = FRANJA_MARCA.map(
    (color) =>
      `<td width="25%" height="${alto}" bgcolor="${color}" style="width:25%;height:${alto}px;padding:0;background-color:${color};font-size:1px;line-height:${alto}px;mso-line-height-rule:exactly">&nbsp;</td>`,
  ).join("");
  return `<table class="rb-franja" role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;table-layout:fixed"><tbody><tr>${celdas}</tr></tbody></table>`;
}

// --- Ajuste de color a la paleta ---------------------------------------------

type Rgb = [number, number, number];

function hexARgb(hex: string): Rgb {
  const h = hex.replace("#", "");
  const largo = h.length === 3 || h.length === 4 ? h.split("").map((c) => c + c).join("") : h;
  return [parseInt(largo.slice(0, 2), 16), parseInt(largo.slice(2, 4), 16), parseInt(largo.slice(4, 6), 16)];
}

function rgbAHex([r, g, b]: Rgb): string {
  return `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("").toUpperCase()}`;
}

/** sRGB → CIELAB (D65), para medir la distancia percibida entre dos colores. */
function aLab([r, g, b]: Rgb): Rgb {
  const lin = (v: number) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const [R, G, B] = [lin(r), lin(g), lin(b)];
  const x = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047;
  const y = R * 0.2126 + G * 0.7152 + B * 0.0722;
  const z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883;
  const f = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
}

type ColorLab = { hex: string; lab: Rgb };
const labDe = (hex: string): ColorLab => ({ hex, lab: aLab(hexARgb(hex)) });
const TINTES = (t: { 100: string; 80: string; 60: string; 40: string; 20: string }) =>
  [t[100], t[80], t[60], t[40], t[20]].map(labDe);
const FAMILIAS = {
  spaceBlue: TINTES(SPACE_BLUE),
  seaGreen: TINTES(SEA_GREEN),
  earthOrange: TINTES(EARTH_ORANGE),
  skyBlue: TINTES(SKY_BLUE),
  mindMagenta: TINTES(MIND_MAGENTA),
  neutro: Object.values(NEUTRO).map(labDe),
} satisfies Record<string, ColorLab[]>;

/** Distancia en Lab completa o solo por claridad (para elegir el tinte dentro de una familia). */
function masCercano(lab: Rgb, candidatos: ColorLab[], soloClaridad = false): ColorLab {
  let mejor = candidatos[0];
  let distancia = Infinity;
  for (const c of candidatos) {
    const d = soloClaridad
      ? (lab[0] - c.lab[0]) ** 2
      : (lab[0] - c.lab[0]) ** 2 + (lab[1] - c.lab[1]) ** 2 + (lab[2] - c.lab[2]) ** 2;
    if (d < distancia) {
      distancia = d;
      mejor = c;
    }
  }
  return mejor;
}

/**
 * El color del manual que le corresponde a uno cualquiera. Primero se elige la
 * FAMILIA por el tono, con el sentido que tienen en la plataforma (un rojo de
 * error va a Mind Magenta, un verde de éxito a Sea Green, un ámbar a Earth
 * Orange; un gris, a los neutros), y dentro de ella el tinte más parecido.
 * Sin esto, un rojo caería en Earth Orange (su vecino en Lab) y un error se
 * leería como una advertencia.
 */
export function colorDeMarcaMasCercano(rgb: Rgb): string {
  // Un color del manual es él mismo (un tinte 20 % casi gris no pasa a los neutros).
  const propio = rgbAHex(rgb);
  if (COLORES_ADMITIDOS.has(propio)) return propio;
  const lab = aLab(rgb);
  if (Math.hypot(lab[1], lab[2]) < 14) return masCercano(lab, FAMILIAS.neutro, true).hex;
  // Tono en Lab: rojo ≈ 40°, amarillo ≈ 95°, verde ≈ 140°, cian ≈ 220°, azul ≈ 290°, magenta ≈ 330°.
  const h = ((Math.atan2(lab[2], lab[1]) * 180) / Math.PI + 360) % 360;
  let familia: ColorLab[];
  if (h >= 355 || h < 50) familia = FAMILIAS.mindMagenta; // rojos
  else if (h < 105) familia = FAMILIAS.earthOrange; // naranjas y amarillos
  else if (h < 200) familia = FAMILIAS.seaGreen; // verdes y verdes azulados
  else if (h < 250) familia = FAMILIAS.skyBlue; // cianes
  else if (h < 305) {
    // Azules: el más parecido decide si es Space Blue o Sky Blue.
    const cercano = masCercano(lab, [...FAMILIAS.spaceBlue, ...FAMILIAS.skyBlue]);
    familia = FAMILIAS.spaceBlue.includes(cercano) ? FAMILIAS.spaceBlue : FAMILIAS.skyBlue;
  } else familia = FAMILIAS.mindMagenta; // violetas y magentas
  return masCercano(lab, familia, true).hex;
}

/** Un color con transparencia se compone sobre el blanco del documento. */
function sobreBlanco([r, g, b]: Rgb, alfa: number): Rgb {
  const a = Math.min(1, Math.max(0, alfa));
  return [r * a + 255 * (1 - a), g * a + 255 * (1 - a), b * a + 255 * (1 - a)];
}

const NOMBRES_COLOR: Record<string, Rgb> = {
  black: [0, 0, 0], white: [255, 255, 255], gray: [128, 128, 128], grey: [128, 128, 128],
  silver: [192, 192, 192], red: [255, 0, 0], maroon: [128, 0, 0], green: [0, 128, 0],
  lime: [0, 255, 0], olive: [128, 128, 0], navy: [0, 0, 128], blue: [0, 0, 255],
  teal: [0, 128, 128], aqua: [0, 255, 255], cyan: [0, 255, 255], purple: [128, 0, 128],
  fuchsia: [255, 0, 255], magenta: [255, 0, 255], orange: [255, 165, 0], yellow: [255, 255, 0],
  pink: [255, 192, 203], brown: [165, 42, 42], gold: [255, 215, 0], indigo: [75, 0, 130],
  violet: [238, 130, 238], crimson: [220, 20, 60], darkblue: [0, 0, 139], darkgreen: [0, 100, 0],
  darkred: [139, 0, 0], lightgray: [211, 211, 211], lightgrey: [211, 211, 211],
  darkgray: [169, 169, 169], darkgrey: [169, 169, 169], whitesmoke: [245, 245, 245],
  gainsboro: [220, 220, 220], steelblue: [70, 130, 180], slategray: [112, 128, 144],
  royalblue: [65, 105, 225], dodgerblue: [30, 144, 255], tomato: [255, 99, 71], coral: [255, 127, 80],
};

const COLOR_LITERAL = new RegExp(
  [
    String.raw`#[0-9a-fA-F]{8}\b`,
    String.raw`#[0-9a-fA-F]{6}\b`,
    String.raw`#[0-9a-fA-F]{3,4}\b`,
    String.raw`rgba?\(\s*[\d.]+%?\s*[, ]\s*[\d.]+%?\s*[, ]\s*[\d.]+%?\s*(?:[,/]\s*[\d.]+%?\s*)?\)`,
    String.raw`hsla?\([^)]*\)`,
    String.raw`\b(?:${Object.keys(NOMBRES_COLOR).join("|")})\b`,
  ].join("|"),
  "gi",
);

function hslARgb(h: number, s: number, l: number): Rgb {
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [255 * f(0), 255 * f(8), 255 * f(4)];
}

function literalARgb(literal: string): Rgb | null {
  const t = literal.trim().toLowerCase();
  if (t.startsWith("#")) {
    const h = t.slice(1);
    const rgb = hexARgb(t);
    const alfa = h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : h.length === 4 ? parseInt(h[3] + h[3], 16) / 255 : 1;
    return alfa < 1 ? sobreBlanco(rgb, alfa) : rgb;
  }
  if (t.startsWith("rgb")) {
    const partes = t.slice(t.indexOf("(") + 1, -1).split(/[\s,/]+/).filter(Boolean);
    const canal = (p: string) => (p.endsWith("%") ? (parseFloat(p) / 100) * 255 : parseFloat(p));
    const rgb: Rgb = [canal(partes[0]), canal(partes[1]), canal(partes[2])];
    const alfa = partes[3] == null ? 1 : partes[3].endsWith("%") ? parseFloat(partes[3]) / 100 : parseFloat(partes[3]);
    return alfa < 1 ? sobreBlanco(rgb, alfa) : rgb;
  }
  if (t.startsWith("hsl")) {
    const partes = t.slice(t.indexOf("(") + 1, -1).split(/[\s,/]+/).filter(Boolean);
    const rgb = hslARgb(parseFloat(partes[0]), parseFloat(partes[1]) / 100, parseFloat(partes[2]) / 100);
    const alfa = partes[3] == null ? 1 : partes[3].endsWith("%") ? parseFloat(partes[3]) / 100 : parseFloat(partes[3]);
    return alfa < 1 ? sobreBlanco(rgb, alfa) : rgb;
  }
  return NOMBRES_COLOR[t] ?? null;
}

/** Colores con los que un TEXTO no se lee sobre fondo claro (no llegan a 3:1). */
const NO_LEGIBLES_COMO_TEXTO = new Set<string>([
  ...Object.values(SEA_GREEN),
  ...Object.values(EARTH_ORANGE),
  ...Object.values(SKY_BLUE),
]);

/**
 * El color de un TEXTO: como el de cualquier otra propiedad, salvo que Sea Green,
 * Earth Orange y Sky Blue no son legibles como texto oscuro sobre fondo claro; ese
 * texto pasa a Space Blue, el «positivo» del manual. Un texto claro (pensado para
 * un fondo oscuro) conserva su tinte.
 */
function colorDeTextoDeMarca(rgb: Rgb): string {
  const cercano = colorDeMarcaMasCercano(rgb);
  if (!NO_LEGIBLES_COMO_TEXTO.has(cercano)) return cercano;
  return aLab(rgb)[0] >= 75 ? cercano : SPACE_BLUE[100];
}

/** Cambia cada color de un VALOR de CSS por el del manual más parecido. */
function ajustarValor(valor: string, deTexto = false): string {
  // Un degradado mezcla colores intermedios: queda el primero de sus colores.
  const sinDegradados = valor.replace(/(?:repeating-)?(?:linear|radial|conic)-gradient\(((?:[^()]|\([^()]*\))*)\)/gi, (_, cuerpo: string) => {
    const primero = cuerpo.match(COLOR_LITERAL)?.[0];
    return primero ?? NEUTRO.blanco;
  });
  return sinDegradados.replace(COLOR_LITERAL, (literal) => {
    const rgb = literalARgb(literal);
    if (!rgb) return literal;
    const cercano = deTexto ? colorDeTextoDeMarca(rgb) : colorDeMarcaMasCercano(rgb);
    // Un color que ya es del manual (y legible, si es texto) se deja tal cual.
    return rgbAHex(rgb) === cercano ? literal : cercano;
  });
}

/** §2: toda familia tipográfica pasa a Lato con Arial de respaldo (conserva `!important`). */
function familiaDeMarca(valor: string): string {
  // `inherit` y los demás valores globales toman la familia del elemento padre (ya de la marca).
  if (/^\s*(?:inherit|initial|unset|revert|revert-layer)\s*(?:!\s*important\s*)?$/i.test(valor)) return valor;
  const importante = /!\s*important\s*$/i.test(valor) ? " !important" : "";
  return FUENTE_PANTALLA + importante;
}

/** `font: 13px/1.55 <otra familia>` → la misma medida con la familia del manual. */
function fuenteAbreviadaDeMarca(valor: string): string {
  const m = valor.match(/^(.*?\d[\d.]*(?:px|pt|em|rem|%|vw|vh)(?:\s*\/\s*[\d.]+[a-z%]*)?)\s+(.+?)(\s*!\s*important)?\s*$/i);
  return m ? `${m[1]} ${FUENTE_PANTALLA}${m[3] ? " !important" : ""}` : valor;
}

/** Propiedades que llevan color; las demás (contenido, rejilla…) no se tocan. */
const PROPIEDAD_DE_COLOR = /^(?:color|background(?:-color|-image)?|border(?:-(?:top|right|bottom|left|block|inline)(?:-start|-end)?)?(?:-color)?|outline(?:-color)?|fill|stroke|box-shadow|text-shadow|text-decoration(?:-color)?|column-rule(?:-color)?|caret-color|accent-color|stop-color|flood-color|lighting-color|--[-\w]+)$/i;

/**
 * Ajusta las declaraciones de color y de tipografía de un bloque CSS o de un
 * atributo `style`. Los `url(...)` y los `@font-face` se apartan antes.
 */
function ajustarCss(css: string): string {
  const urls: string[] = [];
  const apartar = (m: string) => {
    urls.push(m);
    return `\u0000${urls.length - 1}\u0000`;
  };
  // Un @font-face declara UNA familia (no una lista) y sus `url()` son datos: se aparta entero.
  const enmascarado = css
    .replace(/@font-face\s*\{[^}]*\}/gi, apartar)
    .replace(/url\((?:[^()]|\([^()]*\))*\)/gi, apartar);
  const ajustado = enmascarado.replace(
    /((?:^|[{;])(?:\s|\/\*(?:[^*]|\*(?!\/))*\*\/)*)(--[-\w]+|[a-zA-Z][-a-zA-Z]*)(\s*:\s*)([^;{}]*)/g,
    (todo, pre: string, prop: string, sep: string, valor: string) => {
      if (PROPIEDAD_DE_COLOR.test(prop)) return pre + prop + sep + ajustarValor(valor, /^color$/i.test(prop));
      if (/^font-family$/i.test(prop)) return pre + prop + sep + familiaDeMarca(valor);
      if (/^font$/i.test(prop)) return pre + prop + sep + fuenteAbreviadaDeMarca(valor);
      return todo;
    },
  );
  return ajustado.replace(/\u0000(\d+)\u0000/g, (_, i: string) => urls[Number(i)]);
}

/**
 * Lleva TODOS los colores de un HTML generado (bloques <style>, atributos style,
 * bgcolor, color, fill y stroke) al color más cercano de la paleta del manual, y
 * su tipografía a Lato con Arial de respaldo. Pensado para HTML que redacta un
 * modelo de IA: ninguna instrucción garantiza que respete la marca, este ajuste sí.
 */
export function ajustarHtmlAMarca(html: string): string {
  let salida = html.replace(/(<style\b[^>]*>)([\s\S]*?)(<\/style>)/gi, (_, a: string, css: string, c: string) => a + ajustarCss(css) + c);
  salida = salida.replace(/(\sstyle\s*=\s*)(["'])([\s\S]*?)\2/gi, (_, a: string, q: string, css: string) => a + q + ajustarCss(css) + q);
  salida = salida.replace(/(\s(bgcolor|color|fill|stroke)\s*=\s*)(["'])([^"']*)\3/gi, (_, a: string, atributo: string, q: string, valor: string) => a + q + ajustarValor(valor, /^color$/i.test(atributo)) + q);
  // El texto (fuera de etiquetas, estilos y scripts) también: sin emojis ni marcas que no tenga Lato.
  salida = salida.replace(/(<(style|script)\b[\s\S]*?<\/\2>)|(<[^>]*>)|([^<]+)/gi, (todo, bloque: string, _e, etiqueta: string, texto: string) =>
    texto ? ajustarGlifosAMarca(texto) : todo,
  );
  return forzarTipografiaMarca(salida);
}

/**
 * Glifos de un texto redactado fuera del código (el modelo de IA, un reporte
 * guardado): un emoji se dibujaría en color y ✓ o ✗ con una fuente del sistema,
 * porque Lato y Arial no los tienen (§2). El emoji se retira; ✓ queda «Sí» si va
 * solo y se retira si acompaña a un texto; ✗ pasa a «×», que Lato sí trae.
 */
export function ajustarGlifosAMarca(texto: string): string {
  return glifosDeMarca(texto);
}

const MARCA_TIPOGRAFIA = "rb-tipografia";

/**
 * Lo que el navegador pondría por su cuenta en un documento: el texto en negro
 * puro, `<code>` en monoespaciada, los controles con la fuente del sistema, la
 * línea de `<hr>` en gris y los enlaces en el azul de sistema. El documento puede cambiarlo después con su propio CSS.
 */
export const BASE_DOCUMENTO =
  `body{font-family:${FUENTE_PANTALLA};color:${NEUTRO.k90}}` +
  "code,kbd,pre,samp,tt{font-family:inherit}" +
  "button,input,select,textarea{font:inherit;color:inherit}" +
  `hr{border:0;border-top:1px solid ${NEUTRO.k20}}a{color:${SPACE_BLUE[100]}}`;

/**
 * Declara Lato y la deja como fuente del documento (Arial si el lector no la
 * tiene). Va al inicio del <head>: lo que el documento declare después (ya
 * ajustado a la marca) manda sobre esta base.
 */
export function forzarTipografiaMarca(html: string): string {
  if (html.includes(`id="${MARCA_TIPOGRAFIA}"`)) return html;
  const estilo = `<style id="${MARCA_TIPOGRAFIA}">${cssFuentesLato()}${BASE_DOCUMENTO}</style>`;
  if (/<head\b[^>]*>/i.test(html)) return html.replace(/<head\b[^>]*>/i, (m) => `${m}${estilo}`);
  return `${estilo}${html}`;
}

/** Rutas de `public/marca` a direcciones absolutas: un correo o un archivo descargado no conocen la plataforma. */
export function absolutizarRecursosMarca(html: string, origen: string): string {
  const base = origen.replace(/\/+$/, "");
  return html.replace(/(\ssrc\s*=\s*["']|url\(\s*["']?)(\/marca\/)/gi, `$1${base}$2`);
}

/**
 * Para pegar en un correo: el logo pasa a una dirección absoluta (un correo no
 * conoce la plataforma) y la tipografía a Arial, la del correo según el manual.
 */
export function prepararMarcaParaCorreo(html: string, origen: string): string {
  const conPng = html.replace(/\/marca\/russell-bedford-(?:azul|blanco)\.svg/g, (ruta) => PNG_CORREO[ruta] ?? ruta);
  return absolutizarRecursosMarca(conPng, origen).replace(
    /Lato\s*,\s*Arial\s*,\s*Helvetica\s*,\s*sans-serif/gi,
    FUENTE_CORREO,
  );
}

/**
 * Logotipo arriba y franja al pie (como el membrete, §5.1) para un documento que
 * redactó un modelo de IA: no se le pide dibujar la marca, se le pone la oficial.
 */
export function conMarcaDocumento(html: string): string {
  let salida = html;
  if (!salida.includes('class="rb-logo"')) {
    const encabezado = `<div style="max-width:1080px;margin:0 auto;padding:0 28px">${logoHtml({ ancho: 180 })}</div>`;
    salida = /<body\b[^>]*>/i.test(salida)
      ? salida.replace(/<body\b[^>]*>/i, (m) => `${m}${encabezado}`)
      : `${encabezado}${salida}`;
  }
  if (!salida.includes('class="rb-franja"')) {
    const pie = `<div style="max-width:1080px;margin:24px auto 0">${franjaHtml(4)}</div>`;
    salida = /<\/body>/i.test(salida) ? salida.replace(/<\/body>/i, `${pie}</body>`) : `${salida}${pie}`;
  }
  return salida;
}

/**
 * El texto de un documento con solo glifos de Lato, para el PDF: lo arma Chromium en
 * el servidor, donde Arial puede no estar instalada y un glifo que Lato no trae lo
 * dibujaría otra fuente. Estilos, scripts, título y atributos quedan igual.
 */
export function glifosDeDocumentoSoloLato(html: string): string {
  return html.replace(/(<(style|script|title)\b[\s\S]*?<\/\2>)|(<[^>]*>)|([^<]+)/gi, (todo, _b, _e, _t, texto: string) =>
    texto ? glifosSoloLato(texto) : todo,
  );
}
