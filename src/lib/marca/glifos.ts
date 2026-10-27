import { RANGOS_ARIAL, RANGOS_LATO } from "./cobertura-glifos";

/**
 * Glifos de la marca (§2): todo texto se dibuja en Lato y, lo que Lato no trae, en
 * Arial (§2.2). Un emoji o un símbolo que no tenga ninguna de las dos lo dibujaría
 * una fuente del sistema, así que se cambia por su equivalente o se retira. Las
 * letras y cifras de cualquier alfabeto se conservan: son el contenido.
 *
 * Puro: lo usan la interfaz (al mostrar y al escribir), los documentos y el PDF.
 */

function enRangos(rangos: readonly (readonly [number, number])[], cp: number): boolean {
  let bajo = 0;
  let alto = rangos.length - 1;
  while (bajo <= alto) {
    const medio = (bajo + alto) >> 1;
    const [inicio, fin] = rangos[medio];
    if (cp < inicio) alto = medio - 1;
    else if (cp > fin) bajo = medio + 1;
    else return true;
  }
  return false;
}

export function tieneGlifoLato(cp: number): boolean {
  return enRangos(RANGOS_LATO, cp);
}

/** Lato o Arial lo dibujan. */
export function tieneGlifoMarca(cp: number): boolean {
  return enRangos(RANGOS_LATO, cp) || enRangos(RANGOS_ARIAL, cp);
}

/** Símbolos frecuentes sin glifo en Lato ni Arial, con su equivalente que sí lo tiene. */
const EQUIVALENTES: Record<string, string> = {
  "✗": "×", "✘": "×", "✕": "×", "✖": "×", "☒": "×",
  "⋯": "…", "⋮": "…", "⁝": "…",
  "↳": "→", "⇒": "→", "⟶": "→", "➜": "→", "➔": "→", "➝": "→", "➞": "→", "➡": "→", "⮕": "→", "⇨": "→",
  "⇐": "←", "⟵": "←", "⬅": "←", "⇦": "←",
  "⇄": "↔", "⇆": "↔", "⟷": "↔", "⇔": "↔",
  "⬆": "↑", "⇧": "↑", "⬇": "↓", "⇩": "↓",
  "∥": "·", "‖": "·", "∣": "|",
  "▸": "►", "▹": "►", "▶": "►", "◂": "◄", "◃": "◄", "◀": "◄", "▾": "▼", "▿": "▼", "▴": "▲", "▵": "▲",
  "★": "*", "☆": "*", "✦": "*", "✧": "*", "✱": "*", "✳": "*",
  "❝": "“", "❞": "”", "❛": "‘", "❜": "’",
};

const CHEQUEO = /[✓✔☑]️?/u;
// Un emoji: con presentación de emoji, o un pictograma con su selector de emoji; con sus
// uniones (ZWJ), tonos de piel, selectores y teclas encerradas.
const EMOJI = /(?:\p{Emoji_Presentation}|\p{Extended_Pictographic}️|[0-9#*]️?⃣)(?:[️‍⃣\u{1F3FB}-\u{1F3FF}]|\p{Emoji_Presentation}|\p{Extended_Pictographic})*/gu;
// Letras, marcas y cifras decimales de cualquier alfabeto (① o ² no son cifras decimales).
const LETRA = /[\p{L}\p{M}\p{Nd}]/u;
const EMOJI_Y_ESPACIO = new RegExp(`${EMOJI.source} ?`, "gu");

function reemplazarFueraDeMarca(texto: string, cubierto: (cp: number) => boolean, equivalentes: Record<string, string>): string {
  let salida = "";
  for (const ch of texto) {
    const cp = ch.codePointAt(0)!;
    if (cp === 0xfe0f) continue; // selector de emoji: convierte en emoji el carácter anterior
    if (cp < 0x20 || cubierto(cp) || LETRA.test(ch)) salida += ch;
    else if (equivalentes[ch] !== undefined) salida += equivalentes[ch];
    else if (cp >= 0x2460 && cp <= 0x2473) salida += `(${cp - 0x245f})`; // ① … ⑳
    // lo demás (selectores sueltos, símbolos sin equivalente) se retira
  }
  return salida;
}

/** Un texto para mostrar con los glifos de la marca. `✓` solo queda «Sí». */
export function glifosDeMarca(texto: string): string {
  if (!necesitaGlifos(texto)) return texto;
  const sinEmoji = texto
    .replace(EMOJI_Y_ESPACIO, "")
    .replace(/(^|[^\p{L}\p{N}])[✓✔☑]️?(?=\s*$)/gu, "$1Sí")
    .replace(/[✓✔☑]️? ?/gu, "")
    .replace(/[⚠⚙ℹ❗❓❕❔]️? ?/gu, "");
  return reemplazarFueraDeMarca(sinEmoji, tieneGlifoMarca, EQUIVALENTES).replace(/ {2,}/g, " ");
}

/** Lo que se escribe en un campo: igual, sin inventar palabras (✓ se retira). */
export function glifosDeEntrada(texto: string): string {
  if (!necesitaGlifos(texto)) return texto;
  const sinEmoji = texto.replace(EMOJI_Y_ESPACIO, "").replace(/[✓✔☑]️?/gu, "").replace(/[⚠⚙ℹ❗❓❕❔]️?/gu, "");
  return reemplazarFueraDeMarca(sinEmoji, tieneGlifoMarca, EQUIVALENTES);
}

/**
 * Para el PDF que arma el servidor, donde Arial puede no estar instalada: solo glifos
 * de Lato. Lo que solo trae Arial pasa a su equivalente en Lato.
 */
const EQUIVALENTES_LATO: Record<string, string> = {
  ...EQUIVALENTES,
  "→": "›", "←": "‹", "↔": "–", "↑": "+", "↓": "−", "↕": "–",
  "►": "›", "◄": "‹", "▲": "+", "▼": "−", "●": "•", "○": "•", "■": "•", "□": "•", "▪": "•", "▫": "•",
  "≥": ">=", "≤": "<=", "≠": "<>", "≈": "~", "≡": "=", "∑": "Σ",
  "─": "–", "━": "–", "└": "–", "├": "–", "│": "|", "┃": "|",
  "★": "*", "‖": "|",
};

export function glifosSoloLato(texto: string): string {
  const conMarca = glifosDeMarca(texto);
  let pendiente = false;
  for (const ch of conMarca) {
    if (!tieneGlifoLato(ch.codePointAt(0)!) && !LETRA.test(ch)) {
      pendiente = true;
      break;
    }
  }
  return pendiente ? reemplazarFueraDeMarca(conMarca, tieneGlifoLato, EQUIVALENTES_LATO) : conMarca;
}

/** Atajo barato: ¿hay algo que revisar? (la inmensa mayoría de los textos no). */
export function necesitaGlifos(texto: string): boolean {
  if (CHEQUEO.test(texto)) return true;
  for (const ch of texto) {
    const cp = ch.codePointAt(0)!;
    if (cp === 0xfe0f) return true;
    if (cp >= 0x20 && cp !== 0xfeff && !tieneGlifoMarca(cp) && !LETRA.test(ch)) return true;
  }
  return false;
}
