// Separa el texto de una celda en sus PARTES («Ref: PP-004 | Descripción: … | Cant: 60») para
// que el usuario las arrastre a cada campo sin tener que seleccionar el texto a mano. Cada parte
// conserva su tramo exacto en la celda (lo que necesita el deductor) y, si su rótulo lo dice, el
// campo que probablemente es. Es solo una ayuda visual: la regla la deduce el servidor. Puro.
import type { RolLecturaInventario } from "../extraccion/lectura-estructurada";
import { nucleoTramo } from "./modelo-usuario";

export type ParteCelda = {
  /** Tramo del VALOR dentro del texto de la celda (sin el rótulo). */
  inicio: number;
  fin: number;
  valor: string;
  rotulo: string | null;
  rolSugerido: RolLecturaInventario | null;
  /** La parte parece un total del archivo o un título de sección, no un campo del producto. */
  marcaSugerida: "total" | "subtotal" | "seccion" | null;
};

const SEPARADORES = ["|", ";", "·", "\t"];

// El orden importa: «Costo prom. unit.» es unitario aunque diga «costo»; «Valor total» es total.
const SINONIMOS: [RolLecturaInventario, RegExp][] = [
  ["valorUnitario", /\b(unit|unitario|c unit|vr unit|valor unit|costo unit|precio unit|costo prom)\b/],
  ["valorTotal", /\b(total|valor total|costo total|importe|vr total|saldo|valor)\b/],
  ["cantidad", /\b(cant|cantidad|existencia|existencias|exist|unidades|qty|stock)\b/],
  ["referencia", /\b(ref|referencia|codigo|cod|item|sku|articulo|producto cod)\b/],
  ["descripcion", /\b(desc|descripcion|nombre|detalle|producto|articulo nombre)\b/],
  ["tipo", /\b(tipo|categoria|clase|linea|grupo|tipo de inventario|familia)\b/],
];

const normalizar = (t: string) => t.toLocaleLowerCase("es").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[.:]/g, " ").replace(/\s+/g, " ").trim();

export function rolDeRotulo(rotulo: string | null): RolLecturaInventario | null {
  if (!rotulo) return null;
  const n = normalizar(rotulo);
  return SINONIMOS.find(([, re]) => re.test(n))?.[0] ?? null;
}

/** Tramos [inicio, fin) de los segmentos: por separador, o por rótulos «X:» si no hay separador. */
function segmentos(texto: string): [number, number][] {
  const separador = SEPARADORES.find((s) => texto.includes(s));
  if (separador) {
    const salida: [number, number][] = [];
    let desde = 0;
    for (let i = texto.indexOf(separador); i >= 0; i = texto.indexOf(separador, desde)) {
      salida.push([desde, i]);
      desde = i + separador.length;
    }
    salida.push([desde, texto.length]);
    return salida;
  }
  // «Ref: A Cant: 2 Total: 20»: cada rótulo abre una parte.
  // Sin separador, un rótulo es UNA palabra: con varias no se sabe dónde termina el valor anterior.
  const rotulos = [...texto.matchAll(/(?:^|\s)(\p{L}[\p{L}.]*):/gu)];
  if (rotulos.length < 2) return [[0, texto.length]];
  const inicios = rotulos.map((m) => m.index! + (m[0].length - m[1].length - 1));
  return inicios.map((inicio, i) => [i === 0 ? 0 : inicio, inicios[i + 1] ?? texto.length]);
}

const esMayuscula = (t: string) => /\p{Lu}{3,}/u.test(t) && t === t.toLocaleUpperCase("es");

/**
 * Un rótulo de total del archivo («TOTAL GENERAL», «Subtotal») o de sección («TIPO DE INVENTARIO»
 * en mayúsculas y solo en su celda) no es un campo del producto: aceptarlo como «Valor total» o
 * «Tipo» haría pasar el gran total por un producto.
 */
function marcaDeRotulo(rotulo: string | null, solo: boolean, rol: RolLecturaInventario | null): ParteCelda["marcaSugerida"] {
  if (!rotulo) return null;
  const n = normalizar(rotulo);
  if (/^sub ?total/.test(n)) return "subtotal";
  if (/^(total (general|inventario|del inventario|hoja|archivo)|gran total|totales)\b/.test(n)) return "total";
  if (solo && esMayuscula(rotulo) && rol === "valorTotal") return "total";
  if (solo && esMayuscula(rotulo) && rol === "tipo") return "seccion";
  return null;
}

export function partesDeCelda(texto: string): ParteCelda[] {
  if (!texto.trim()) return [];
  const partes: ParteCelda[] = [];
  for (const [desde, hasta] of segmentos(texto)) {
    const [a, b] = nucleoTramo(texto, desde, hasta);
    if (a >= b) continue;
    const segmento = texto.slice(a, b);
    const m = segmento.match(/^([^:]{1,40}):\s*/u);
    const conRotulo = m && /\p{L}/u.test(m[1]) && m[0].length < segmento.length;
    const inicio = conRotulo ? a + m[0].length : a;
    const [vi, vf] = nucleoTramo(texto, inicio, b);
    if (vi >= vf) continue;
    const rotulo = conRotulo ? m[1].trim() : null;
    partes.push({ inicio: vi, fin: vf, valor: texto.slice(vi, vf), rotulo, rolSugerido: rolDeRotulo(rotulo), marcaSugerida: null });
  }
  for (const p of partes) {
    p.marcaSugerida = marcaDeRotulo(p.rotulo, partes.length === 1, p.rolSugerido);
    if (p.marcaSugerida) p.rolSugerido = null;
  }
  // Un mismo campo propuesto dos veces no es una propuesta: se deja la primera.
  const vistos = new Set<RolLecturaInventario>();
  for (const p of partes) {
    if (!p.rolSugerido) continue;
    if (vistos.has(p.rolSugerido)) p.rolSugerido = null;
    else vistos.add(p.rolSugerido);
  }
  return partes;
}
