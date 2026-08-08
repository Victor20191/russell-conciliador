// Transformación DETERMINISTA y PURA (sin BD/IA) de un archivo de módulo: aplica el
// `SpecModulo` (mapeo de columnas) a la grilla y produce las filas listas para el staging.
// Genérico: la forma sale del descriptor. Reutiliza los helpers numéricos del balance.
//
// Reglas:
//  - Lee cada columna mapeada del rol → `datos[rol]` (número o texto según el descriptor).
//  - DERIVA columnas faltantes (`descriptor.derivar`, p. ej. valorTotal = cantidad×valorUnit)
//    y AVISA (excepción) si el archivo trae ambas y no concuerdan (no las pisa).
//  - PROMUEVE `clasificador` y `valor` (las columnas que el descriptor marca) a campos
//    propios, para consolidar sin abrir el JSON.
//  - Marca AGRUPADOR las filas en NEGRITA/subrayado (subtotales); no cuentan en el valor.
import { normalizarMonto } from "@/lib/balance/extraccion/transformar";
import type { CeldaCruda, GridHoja } from "@/lib/balance/extraccion/ingesta";
import type { DescriptorModulo } from "../descriptores";
import type { SpecModulo } from "./esquema";

export type TipoFilaModulo = "movimiento" | "agrupadora" | "total";
export type ValorCelda = string | number | null;

// Etiqueta del clasificador cuando el inventario es GLOBAL (un solo valor para todo el archivo).
export const CLASIFICADOR_GLOBAL = "GLOBAL";

export type FilaModulo = {
  filaNum: number; // 1-based en la hoja origen
  clasificador: string | null;
  valor: number;
  datos: Record<string, ValorCelda>; // rol → valor (todas las columnas mapeadas)
  tipoFila: TipoFilaModulo;
};

export type ExcepcionModulo = { filaNum: number; mensaje: string };

export type ResultadoTransformModulo = {
  filas: FilaModulo[];
  filasLeidas: number; // filas de datos no vacías
  filasExcluidas: number; // agrupadoras/totales (no cuentan en el valor)
  excepciones: ExcepcionModulo[];
};

/** Redondea a 2 decimales (Decimal 18,2) y normaliza el −0. */
function redondear(v: number): number {
  return Math.round(v * 100) / 100 + 0 || 0;
}

const celda = (fila: CeldaCruda[], col1: number): CeldaCruda => (col1 >= 1 ? (fila[col1 - 1] ?? null) : null);
const aTexto = (c: CeldaCruda): string | null => (c == null ? null : String(c).replace(/\s+/g, " ").trim() || null);
const aNumero = (c: CeldaCruda): number | null =>
  typeof c === "number" ? c : typeof c === "boolean" ? (c ? 1 : 0) : c == null ? null : normalizarMonto(String(c));

/**
 * ¿La fila es AGRUPADORA (subtotal/encabezado en negrita)? Se decide por la señal de
 * negrita de las columnas CLAVE (clasificador + valor): un renglón donde esas celdas van
 * en negrita es un subtotal del ERP, no un ítem. Si el archivo no trae negrita (xls/csv),
 * nunca marca agrupadora aquí (el usuario lo hace a mano en el borrador).
 */
function esAgrupadoraPorNegrita(negritaFila: boolean[] | undefined, spec: SpecModulo, descriptor: DescriptorModulo): boolean {
  if (!negritaFila) return false;
  const cols = [descriptor.clasificador, descriptor.valor]
    .map((rol) => spec.columnas[rol] ?? 0)
    .filter((c) => c >= 1);
  if (cols.length === 0) return false;
  return cols.some((c) => negritaFila[c - 1] === true);
}

/**
 * Aplica un spec a una hoja y devuelve las filas del módulo. Puro y determinista.
 */
export function transformarModulo(descriptor: DescriptorModulo, spec: SpecModulo, hoja: GridHoja): ResultadoTransformModulo {
  const filas: FilaModulo[] = [];
  const excepciones: ExcepcionModulo[] = [];
  let filasLeidas = 0;
  let filasExcluidas = 0;
  const esNumerica = new Map(descriptor.columnas.map((c) => [c.nombre, c.tipo === "numero" || c.tipo === "moneda"]));

  // Modo del clasificador. `arrastrarClasificador` legado ≡ "arrastrar".
  const modo = spec.clasificadorModo ?? (spec.arrastrarClasificador ? "arrastrar" : "columna");
  const clasCol = spec.columnas[descriptor.clasificador] ?? 0;
  const esTotal = (s: string) => /^(gran\s+)?total\b/i.test(s.trim());
  let ultimoClasificador: string | null = null; // modo "arrastrar" (forward-fill)
  let seccionActual: string | null = null; // modo "seccion" (encabezados de grupo)
  // ¿La fila es un ENCABEZADO DE SECCIÓN? (modo "seccion"): su clasificador tiene texto y,
  // o bien la columna marcada viene vacía (título, no ítem), o el clasificador va en negrita.
  const rolVacioSeccion = spec.seccionColumnaVaciaRol;
  // La señal por "columna vacía" SOLO vale si esa columna está mapeada (col ≥ 1); si no,
  // datos[rol] sería siempre null y TODAS las filas se verían como sección (footgun).
  const seccionPorVacia = !!rolVacioSeccion && (spec.columnas[rolVacioSeccion] ?? 0) >= 1;
  const esRenglonSeccion = (datos: Record<string, ValorCelda>, negritaFila: boolean[] | undefined): boolean => {
    const etiqueta = aTexto(datos[descriptor.clasificador]);
    if (etiqueta == null) return false;
    const marcaVacia = seccionPorVacia ? datos[rolVacioSeccion!] == null || datos[rolVacioSeccion!] === "" : false;
    const negrita = negritaFila && clasCol >= 1 ? negritaFila[clasCol - 1] === true : false;
    return marcaVacia || negrita;
  };

  for (let r = spec.primeraFilaDatos - 1; r < hoja.filas.length; r++) {
    const fila = hoja.filas[r] ?? [];
    const filaNum = r + 1;

    // 1) Leer cada columna mapeada según su tipo.
    const datos: Record<string, ValorCelda> = {};
    for (const rc of descriptor.columnas) {
      const col = spec.columnas[rc.nombre] ?? 0;
      if (col < 1) { datos[rc.nombre] = null; continue; }
      const raw = celda(fila, col);
      datos[rc.nombre] = esNumerica.get(rc.nombre) ? aNumero(raw) : aTexto(raw);
    }

    // 1.5) Modo "seccion": los ENCABEZADOS de grupo fijan el clasificador de los ítems que
    //      siguen y NO se cargan como ítems. Los totales (Gran total) se descartan y no fijan sección.
    if (modo === "seccion" && esRenglonSeccion(datos, hoja.negrita?.[r])) {
      const etiqueta = aTexto(datos[descriptor.clasificador]);
      if (etiqueta && !esTotal(etiqueta)) seccionActual = etiqueta;
      filasExcluidas++;
      continue;
    }

    // 2) Fila vacía (nada útil en ninguna columna) → se salta.
    const vacia = descriptor.columnas.every((rc) => {
      const v = datos[rc.nombre];
      return v == null || v === "" || v === 0;
    });
    if (vacia) continue;

    // 3) Derivaciones: producto (a×b) o cociente (a÷b). Solo rellenan la columna
    //    destino cuando falta; el producto además avisa si el archivo la trae y no cuadra.
    for (const [destino, regla] of Object.entries(descriptor.derivar ?? {})) {
      const actual = aNumero(datos[destino]);
      const yaEsta = actual != null && actual !== 0;
      if ("producto" in regla) {
        const a = aNumero(datos[regla.producto[0]]);
        const b = aNumero(datos[regla.producto[1]]);
        if (a == null || b == null) continue;
        const producto = redondear(a * b);
        if (!yaEsta) datos[destino] = producto;
        else if (Math.abs(actual - producto) > 1) {
          excepciones.push({ filaNum, mensaje: `${destino} (${actual}) ≠ ${regla.producto[0]}×${regla.producto[1]} (${producto})` });
        }
      } else {
        // cociente: valorUnitario = valorTotal ÷ cantidad (respeta el existente, evita ÷0).
        if (yaEsta) continue;
        const num = aNumero(datos[regla.cociente[0]]);
        const den = aNumero(datos[regla.cociente[1]]);
        if (num == null || den == null || den === 0) continue;
        datos[destino] = redondear(num / den);
      }
    }

    // 4) Promover clasificador + valor (los campos que consolida el descriptor), según el modo.
    let clasificador = aTexto(datos[descriptor.clasificador]);
    if (modo === "global") {
      // Inventario GLOBAL: todo el archivo cae en un único clasificador.
      clasificador = CLASIFICADOR_GLOBAL;
      datos[descriptor.clasificador] = CLASIFICADOR_GLOBAL;
    } else if (modo === "seccion") {
      // El tipo del ítem es la sección vigente (la columna del clasificador trae otro dato,
      // p. ej. el código, que se conserva en su rol propio —referencia—).
      clasificador = seccionActual;
      datos[descriptor.clasificador] = seccionActual;
    } else if (modo === "arrastrar") {
      if (clasificador != null) ultimoClasificador = clasificador;
      else { clasificador = ultimoClasificador; datos[descriptor.clasificador] = clasificador; }
    }
    const valor = redondear(aNumero(datos[descriptor.valor]) ?? 0);

    // 5) Tipo de fila (agrupador por negrita → no cuenta en el valor).
    const tipoFila: TipoFilaModulo = esAgrupadoraPorNegrita(hoja.negrita?.[r], spec, descriptor) ? "agrupadora" : "movimiento";
    if (tipoFila === "agrupadora") filasExcluidas++;
    else filasLeidas++;

    filas.push({ filaNum, clasificador, valor, datos, tipoFila });
  }

  return { filas, filasLeidas, filasExcluidas, excepciones };
}
