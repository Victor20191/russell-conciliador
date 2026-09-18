// Lógica PURA de promoción (staging → detalle oficial) y consolidación por clasificador.
// Sin BD: las Server Actions leen el staging, llaman estas funciones y persisten.

import { claveConsolidado } from "./nomina/clave-consolidado";

export type FilaStagingModulo = {
  filaNum: number;
  clasificador: string | null;
  valor: number;
  datos: Record<string, unknown>;
  tipoFila: string; // movimiento | agrupadora | total
  omitida: boolean | null; // tri-estado
  /** Motivo de la detección («gran_total:…», «subtotal:…»): identifica el total del archivo. */
  motivo?: string | null;
};

export type FilaDetalleModulo = {
  filaNum: number;
  clasificador: string | null;
  valor: number;
  datos: Record<string, unknown>;
};

const redondear = (v: number): number => Math.round(v * 100) / 100 + 0 || 0;

/** ¿El renglón está TODO en cero? (todas las columnas numéricas en 0 o vacías) → no se
 *  lleva al definitivo. Si no hay columnas numéricas, nunca es «en cero». */
export function filaEnCero(datos: Record<string, unknown>, columnasNumericas: string[]): boolean {
  if (columnasNumericas.length === 0) return false;
  return columnasNumericas.every((c) => {
    const v = datos[c];
    return v == null || v === "" || Number(v) === 0;
  });
}

/**
 * ¿Fila IMPUTABLE al dato oficial? Solo movimientos NO omitidos y NO en cero; las
 * agrupadoras (subtotales), las omitidas y los renglones en cero no van al oficial.
 *
 * El «en cero» mira PRIMERO el `valor` ya promovido. Antes solo miraba las columnas
 * numéricas del descriptor, y eso descartaba en silencio las filas cuyo importe no vive en
 * ninguna de ellas: en un reporte real de cartera, 7.908 de 10.131 documentos traen la
 * columna «Total» en cero porque su importe está en el balde de vencimiento que les
 * corresponde. Con `valor` ≠ 0 la fila imputa, venga de donde venga ese valor.
 */
export function esImputable(f: Pick<FilaStagingModulo, "tipoFila" | "omitida">, columnasNumericas: string[] = []): boolean {
  if (f.tipoFila !== "movimiento" || f.omitida === true) return false;
  if ("valor" in f && Number((f as FilaStagingModulo).valor) !== 0) return true;
  if (columnasNumericas.length && "datos" in f) return !filaEnCero((f as FilaStagingModulo).datos, columnasNumericas);
  return true;
}

/**
 * Convierte el staging (con las ediciones manuales ya aplicadas) en el detalle oficial:
 * solo las filas imputables, el total sumado y el conteo.
 */
export function promoverStaging(filas: FilaStagingModulo[], columnasNumericas: string[] = []): { detalle: FilaDetalleModulo[]; total: number; filas: number } {
  const imputables = filas.filter((f) => esImputable(f, columnasNumericas));
  const detalle: FilaDetalleModulo[] = imputables.map((f) => ({ filaNum: f.filaNum, clasificador: f.clasificador, valor: f.valor, datos: f.datos }));
  const total = redondear(imputables.reduce((s, f) => s + f.valor, 0));
  return { detalle, total, filas: imputables.length };
}

export type ConsolidadoClasificador = {
  /** El clasificador o, con `porAgrupador`, la clave «clasificador ∥ agrupador». */
  clasificador: string;
  total: number;
  filas: number;
  /** Solo con `porAgrupador`: el clasificador a secas y el agrupador ('' si la fila no trae). */
  codigo?: string;
  agrupador?: string;
};

/**
 * Consolida por CLASIFICADOR (Σ valor), excluyendo agrupadoras y totales (subtotales del
 * archivo): SOLO suman los movimientos. Base de la pestaña «Consolidado» y del cruce contra
 * la cuenta de 4 díg. `null` cae en «(sin clasificar)».
 *
 * Con `porAgrupador` (Nómina) el renglón es el par (clasificador, agrupador): un mismo concepto
 * en dos centros de costo son dos renglones, porque pueden ir a cuentas distintas (510506 en
 * administración, 720505 en producción). La clave del renglón se serializa con
 * `claveConsolidado` para que la pestaña, sus acciones y las anclas sigan llaveando por un
 * solo string.
 */
/** Renglón de las filas sin clasificador (el archivo no trae la columna o la celda viene vacía). */
export const SIN_CLASIFICAR = "(sin clasificar)";

export function consolidarPorClasificador(
  filas: Array<{ clasificador: string | null; valor: number; tipoFila?: string; agrupador?: string | null }>,
  opciones?: { porAgrupador?: boolean },
): ConsolidadoClasificador[] {
  const porAgrupador = opciones?.porAgrupador === true;
  const m = new Map<string, { total: number; filas: number; codigo: string; agrupador: string }>();
  for (const f of filas) {
    if (f.tipoFila && f.tipoFila !== "movimiento") continue;
    const codigo = f.clasificador?.trim() || SIN_CLASIFICAR;
    const agrupador = porAgrupador ? String(f.agrupador ?? "").trim() : "";
    const k = porAgrupador ? claveConsolidado(codigo, agrupador) : codigo;
    const b = m.get(k) ?? { total: 0, filas: 0, codigo, agrupador };
    b.total += f.valor;
    b.filas += 1;
    m.set(k, b);
  }
  return [...m.entries()]
    .map(([clasificador, b]) => (porAgrupador
      ? { clasificador, total: redondear(b.total), filas: b.filas, codigo: b.codigo, agrupador: b.agrupador }
      : { clasificador, total: redondear(b.total), filas: b.filas }))
    .sort((a, b) => Math.abs(b.total) - Math.abs(a.total) || a.clasificador.localeCompare(b.clasificador));
}
