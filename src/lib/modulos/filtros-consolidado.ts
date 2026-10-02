// Filtros por COLUMNA de la pestaña «Consolidado» de un cargue de módulo (puro, sin BD ni UI).
//
// La tabla del Consolidado tiene cuatro columnas —clasificador, filas, total y las cuentas
// Russell asignadas— y hasta ahora solo se podía recortar con «Sin cuenta asignada». Con 102
// conceptos (Nómina de MELONN) encontrar uno era bajar a mano. Mismo criterio que el detalle:
// texto por subcadena sin tildes ni mayúsculas, numérico con >, >=, <, <= y =.
import { coincideFiltroNumerico, coincideFiltroTexto } from "./filtros-detalle-modulo";

/** Columna → texto escrito en su filtro ('' = sin filtro). */
export type FiltrosConsolidado = {
  /** Clasificador, su nombre y, en Nómina, su centro de costo. */
  clasificador?: string;
  filas?: string;
  total?: string;
  /** Códigos y nombres de las cuentas Russell de la fila. */
  cuentas?: string;
};

/** Fila del Consolidado tal como la ve el filtro. */
export type FilaConsolidadoFiltrable = {
  clasificador: string;
  /** Nombre legible del clasificador (Nómina: el concepto detrás del código). */
  descripcion?: string | null;
  /** Centro de costo / grupo del archivo (Nómina). */
  agrupador?: string | null;
  filas: number;
  total: number;
  /** Cuentas de la fila: código y nombre, para buscar por cualquiera de los dos. */
  cuentas: readonly { codigo: string; nombre?: string | null }[];
};

export function hayFiltrosConsolidado(filtros: FiltrosConsolidado): boolean {
  return Object.values(filtros).some((v) => (v ?? "").trim() !== "");
}

/**
 * ¿La fila cumple TODOS los filtros activos? El filtro del clasificador busca a la vez en el
 * código, en su nombre y en el centro de costo: quien escribe «cesantías» no tiene por qué saber
 * que el clasificador de Nómina es el código del concepto.
 */
export function coincideFilaConsolidado(fila: FilaConsolidadoFiltrable, filtros: FiltrosConsolidado): boolean {
  const texto = (filtros.clasificador ?? "").trim();
  if (texto && ![fila.clasificador, fila.descripcion, fila.agrupador].some((v) => coincideFiltroTexto(v, texto))) return false;
  const cuentas = (filtros.cuentas ?? "").trim();
  if (cuentas) {
    const alguna = fila.cuentas.some((c) => coincideFiltroTexto(c.codigo, cuentas) || coincideFiltroTexto(c.nombre, cuentas));
    // «sin cuenta» (o «sin») encuentra las filas que no tienen ninguna asignada.
    const buscaVacias = coincideFiltroTexto("sin cuenta", cuentas) && fila.cuentas.length === 0;
    if (!alguna && !buscaVacias) return false;
  }
  if (!coincideFiltroNumerico(fila.filas, filtros.filas ?? "")) return false;
  return coincideFiltroNumerico(fila.total, filtros.total ?? "");
}

/** Filtra las filas del Consolidado (sin filtros → las mismas filas). */
export function filtrarConsolidado<T extends FilaConsolidadoFiltrable>(filas: readonly T[], filtros: FiltrosConsolidado): T[] {
  if (!hayFiltrosConsolidado(filtros)) return [...filas];
  return filas.filter((f) => coincideFilaConsolidado(f, filtros));
}
