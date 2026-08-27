// Filtros por COLUMNA del detalle de un dato de módulo cargado (puro, sin BD ni UI).
// Genérico sobre las columnas del descriptor: texto → subcadena normalizada;
// numérico (cantidad/moneda) → operadores >, >=, <, <=, = (mismo criterio que el balance).

/** nombre de columna del descriptor → texto del filtro (vacío = sin filtro). */
export type FiltrosDetalleModulo = Record<string, string>;

export type ColumnaFiltro = { nombre: string; tipo: string };
export type FilaFiltrable = { datos: Record<string, string | number | null> };
export type ObtenerValorColumna<T extends FilaFiltrable> = (
  fila: T,
  columna: ColumnaFiltro,
) => string | number | null | undefined;

const esNumerica = (tipo: string) => tipo === "numero" || tipo === "moneda";

function normalizarTexto(valor: string): string {
  return valor
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

function numeroFiltro(valor: string): number | null {
  const limpio = valor.replace(/[$%\s]/g, "");
  if (!limpio) return null;
  // es-CO: el punto agrupa miles y la coma es decimal; también admite punto decimal simple.
  const colombiano = /^[-+]?\d{1,3}(?:\.\d{3})+(?:,\d+)?$/.test(limpio);
  const canonico = colombiano ? limpio.replace(/\./g, "").replace(",", ".") : limpio.replace(",", ".");
  const numero = Number(canonico);
  return Number.isFinite(numero) ? numero : null;
}

/** Admite igualdad implícita y los operadores >, >=, <, <= y =. Filtro vacío → true. */
export function coincideFiltroNumerico(valor: number | null | undefined, filtro: string): boolean {
  const entrada = filtro.trim();
  if (!entrada) return true;
  if (valor == null || !Number.isFinite(valor)) return false;
  const match = /^(<=|>=|<|>|=)?\s*(.+)$/.exec(entrada);
  if (!match) return false;
  const esperado = numeroFiltro(match[2]);
  if (esperado == null) return false;
  switch (match[1] ?? "=") {
    case ">": return valor > esperado;
    case ">=": return valor >= esperado;
    case "<": return valor < esperado;
    case "<=": return valor <= esperado;
    default: return Math.abs(valor - esperado) < 0.0001;
  }
}

export function hayFiltrosDetalleModulo(filtros: FiltrosDetalleModulo): boolean {
  return Object.values(filtros).some((v) => v.trim() !== "");
}

const valorDesdeDatos = <T extends FilaFiltrable>(fila: T, columna: ColumnaFiltro) =>
  fila.datos[columna.nombre];

/** ¿La fila cumple TODOS los filtros de columna activos? */
export function coincideFilaDetalle<T extends FilaFiltrable>(
  fila: T,
  columnas: ColumnaFiltro[],
  filtros: FiltrosDetalleModulo,
  obtenerValor: ObtenerValorColumna<T> = valorDesdeDatos,
): boolean {
  for (const col of columnas) {
    const f = filtros[col.nombre];
    if (!f || !f.trim()) continue;
    const v = obtenerValor(fila, col);
    if (esNumerica(col.tipo)) {
      if (!coincideFiltroNumerico(v == null || v === "" ? null : Number(v), f)) return false;
    } else if (!normalizarTexto(String(v ?? "")).includes(normalizarTexto(f))) {
      return false;
    }
  }
  return true;
}

/** Filtra las filas del detalle por los filtros de columna (sin filtros → mismas filas). */
export function filtrarFilasDetalleModulo<T extends FilaFiltrable>(
  filas: T[],
  columnas: ColumnaFiltro[],
  filtros: FiltrosDetalleModulo,
  obtenerValor: ObtenerValorColumna<T> = valorDesdeDatos,
): T[] {
  if (!hayFiltrosDetalleModulo(filtros)) return filas;
  return filas.filter((f) => coincideFilaDetalle(f, columnas, filtros, obtenerValor));
}
