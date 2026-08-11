import type { NodoBorrador } from "./borrador";
import { coincideFiltroNumerico } from "./filtros-detalle";

/**
 * Filtros por columna de la tabla de movimiento del borrador.
 * Solo cubre las columnas visibles (código, cuenta y montos): el borrador no
 * tiene mapeo estándar, variación ni validación de naturaleza.
 */
export type FiltrosColumnasBorrador = {
  codigo: string;
  cuenta: string;
  saldoAnterior: string;
  debito: string;
  credito: string;
  saldo: string;
};

export const FILTROS_COLUMNAS_BORRADOR_INICIALES: FiltrosColumnasBorrador = {
  codigo: "",
  cuenta: "",
  saldoAnterior: "",
  debito: "",
  credito: "",
  saldo: "",
};

function normalizarTexto(valor: string): string {
  return valor
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function coincideNodo(
  nodo: NodoBorrador,
  filtros: FiltrosColumnasBorrador,
): boolean {
  const codigo = normalizarTexto(filtros.codigo);
  if (codigo) {
    const codigoNodo = normalizarTexto(nodo.codigo);
    const codigoCrudo = normalizarTexto(nodo.codigoCrudo ?? "");
    if (!codigoNodo.includes(codigo) && !codigoCrudo.includes(codigo)) return false;
  }

  const cuenta = normalizarTexto(filtros.cuenta);
  if (cuenta && !normalizarTexto(nodo.nombre ?? "").includes(cuenta)) return false;

  if (!coincideFiltroNumerico(nodo.saldoInicial, filtros.saldoAnterior)) return false;
  if (!coincideFiltroNumerico(nodo.debitos, filtros.debito)) return false;
  if (!coincideFiltroNumerico(nodo.creditos, filtros.credito)) return false;
  if (!coincideFiltroNumerico(nodo.saldoFinal, filtros.saldo)) return false;

  return true;
}

export function hayFiltrosColumnasBorrador(
  filtros: FiltrosColumnasBorrador,
): boolean {
  return filtros.codigo.trim() !== ""
    || filtros.cuenta.trim() !== ""
    || filtros.saldoAnterior.trim() !== ""
    || filtros.debito.trim() !== ""
    || filtros.credito.trim() !== ""
    || filtros.saldo.trim() !== "";
}

/**
 * Conserva cada coincidencia y su ruta de ancestros, sin incorporar hermanos
 * que no cumplen. Sin filtros devuelve el mismo array (identidad) para evitar
 * clonar árboles grandes del borrador.
 */
export function filtrarArbolBorradorPorColumnas(
  nodos: NodoBorrador[],
  filtros: FiltrosColumnasBorrador,
): NodoBorrador[] {
  if (!hayFiltrosColumnasBorrador(filtros)) return nodos;

  const podar = (rama: readonly NodoBorrador[]): NodoBorrador[] => {
    const resultado: NodoBorrador[] = [];
    for (const nodo of rama) {
      const hijos = podar(nodo.hijos);
      if (coincideNodo(nodo, filtros) || hijos.length > 0) {
        resultado.push({ ...nodo, hijos });
      }
    }
    return resultado;
  };

  return podar(nodos);
}
