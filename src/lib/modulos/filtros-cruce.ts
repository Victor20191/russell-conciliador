// Filtros por COLUMNA de las dos tablas del cruce contable (puro, sin BD ni UI): la cédula y,
// en Nómina, el cruce por subcuenta PUC. Mismo criterio que el detalle y el Consolidado: texto por
// subcadena sin tildes ni mayúsculas (con el comodín de posición para los códigos) y numérico con
// los operadores >, >=, <, <= y =.
import { coincideFiltroNumerico, coincideFiltroTexto } from "./filtros-detalle-modulo";

/** Columna → texto escrito ('' = sin filtro). Las claves son las de cada tabla. */
export type FiltrosCruce = Record<string, string>;

export function hayFiltrosCruce(filtros: FiltrosCruce): boolean {
  return Object.values(filtros).some((v) => (v ?? "").trim() !== "");
}

/** Qué valor mira cada columna de una fila: texto o número (lo decide quien llama). */
export type ColumnasCruce<T> = Record<string, { texto?: (fila: T) => string | null | undefined; numero?: (fila: T) => number | null | undefined }>;

/** ¿La fila cumple TODOS los filtros activos? Una columna sin definir no filtra. */
export function coincideFilaCruce<T>(fila: T, columnas: ColumnasCruce<T>, filtros: FiltrosCruce): boolean {
  for (const [columna, filtro] of Object.entries(filtros)) {
    if (!filtro || !filtro.trim()) continue;
    const acceso = columnas[columna];
    if (!acceso) continue;
    if (acceso.numero) {
      if (!coincideFiltroNumerico(acceso.numero(fila) ?? null, filtro)) return false;
    } else if (acceso.texto && !coincideFiltroTexto(acceso.texto(fila), filtro)) {
      return false;
    }
  }
  return true;
}

/** Filtra las filas de una tabla del cruce (sin filtros → las mismas filas). */
export function filtrarFilasCruce<T>(filas: readonly T[], columnas: ColumnasCruce<T>, filtros: FiltrosCruce): T[] {
  if (!hayFiltrosCruce(filtros)) return [...filas];
  return filas.filter((f) => coincideFilaCruce(f, columnas, filtros));
}
